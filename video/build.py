#!/usr/bin/env python3
"""
Build the Lanternfolk demo video from real emulator takes (see app/tools/film.py).

Inputs  (TAKES dir): A.mp4 B.mp4 C.mp4 + A/B/C/game_audio.wav (the game's own
         soundtrack re-rendered from the logged cue times by app/tools/render_audio.mjs)
Output: Lanternfolk_Demo.mp4 (1920x1080, 30 fps, < 3 min) + Lanternfolk_Demo.srt

Narration: Kokoro TTS (open-weight, Apache-2.0), voice am_michael, generated locally.
Run: TTS_DIR=/path/to/tts python3 video/build.py TAKES_DIR   (needs Pillow + ffmpeg; TTS runs in its own venv)
The raw takes (A/B/C.mp4 + game_audio.wav) are not stored in git; re-film them with tools/film.py.
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TAKES = os.path.abspath(sys.argv[1])
WORK = os.path.join(HERE, "build")
OUT = os.path.join(HERE, "Lanternfolk_Demo.mp4")
# Folder with a Kokoro ONNX helper (tts.py + venv); set TTS_DIR in the environment.
TTS_DIR = os.environ.get("TTS_DIR", "")
FONT = "/System/Library/Fonts/Supplemental/Trebuchet MS.ttf"
FONT_B = "/System/Library/Fonts/Supplemental/Trebuchet MS Bold.ttf"
W, H = 1920, 1080
os.makedirs(WORK, exist_ok=True)

# (take, in, out) in take seconds — all real gameplay footage.
SEGMENTS = [
    ("A", 69.0, 74.0),   # hook: a steady palm, the spirit walks across it
    ("A", 0.5, 8.0),     # cold open: the grove rises; title, Chapter 1
    ("A", 34.5, 41.0),   # touch to wake the shy spirit
    ("A", 43.0, 50.0),   # first gap: it walks across the palm
    ("A", 56.5, 64.0),   # wide gap: a tipped palm, it wobbles and floats back dizzy
    ("A", 66.5, 80.0),   # retry with a steady palm; home
    ("A", 82.0, 86.0),   # the grove turns: Chapter 2
    ("B", 13.0, 31.0),   # wake, climb aboard, bump a swinging branch
    ("B", 35.0, 56.0),   # up and over to the ledge, then to the top; two lights shine
    ("B", 57.0, 62.0),   # Chapter 3 card
    ("C", 4.0, 14.0),    # wake two friends
    ("C", 20.0, 34.0),   # pinch the leaf, lay it across, both cross; every light is home
    ("C", 40.5, 53.0),   # scoop the star onto the palm, carry it up, set it in the tree
    ("C", 53.0, 66.0),   # the grove awakens; gathering; thank you; play again
]
END_CARD = 13.0

# (start second in the final video, text). Captions show the same words.
NARRATION = [
    (0.5, "They were lost in the dark. All they needed was a helping hand."),
    (5.5, "This is Lanternfolk: three short chapters, played seated, with nothing but your hands."),
    (13.0, "Chapter one. A shy lantern spirit is asleep. One gentle touch wakes it."),
    (19.5, "Hold out your palm, and it walks across your hand."),
    (26.5, "But keep it steady. Tip your hand, and it loses its balance, and floats back, a little dizzy."),
    (37.0, "Try again, slowly, and it makes it home."),
    (47.3, "Chapter two."),
    (52.0, "A playful spirit climbs onto your palm. Lift it to the ledge, but mind the swinging branches."),
    (70.0, "Go up, and over, one ledge at a time."),
    (80.0, "Each friend you bring home lights the grove, and the music grows warmer."),
    (90.3, "Chapter three."),
    (95.5, "Two friends need a bridge."),
    (105.5, "Pinch the glowing leaf, and lay it across. The spirits you rescued watch, and cheer each one home."),
    (119.5, "Finally, scoop the star onto your open palm, and carry it, steadily, to the top of the great tree."),
    (133.0, "The grove wakes up. Every spirit gathers, and the first friend you helped comes to say thank you."),
    (145.5, "Lanternfolk. Your hands can become someone else's way home."),
]


def run(cmd):
    subprocess.run(cmd, check=True)


def probe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


def tts():
    """Kokoro ONNX via the local TTS helper (its own venv), voice am_michael, slightly slow."""
    py = os.path.join(TTS_DIR, "venv", "bin", "python")
    lines = []
    for i, (start, text) in enumerate(NARRATION):
        f = os.path.join(WORK, f"vo_{i:02d}.wav")
        if not os.path.exists(f):
            run([py, os.path.join(TTS_DIR, "tts.py"), "kokoro", "am_michael", text, f, "0.9"])
        lines.append((start, text, f, probe_duration(f)))
    return lines


def cut_segments():
    parts = []
    for i, (take, a, b) in enumerate(SEGMENTS):
        v = os.path.join(WORK, f"seg_{i:02d}.mp4")
        d = b - a
        fade = 0.35
        run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-t", str(d), "-i", os.path.join(TAKES, f"{take}.mp4"),
             "-ss", str(a), "-t", str(d), "-i", os.path.join(TAKES, take, "game_audio.wav"),
             "-filter_complex",
             f"[0:v]scale={W}:{H}:flags=lanczos,fps=30,format=yuv420p,fade=t=in:st=0:d={fade},fade=t=out:st={d - fade}:d={fade}[v];"
             f"[1:a]aresample=48000,afade=t=in:st=0:d={fade},afade=t=out:st={d - fade}:d={fade}[a]",
             "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-c:a", "pcm_s16le", v])
        parts.append(v)
    return parts


def text_png(path, lines, size, y, bold=False, box=True, align="center", alpha=230):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_B if bold else FONT, size)
    widths = [d.textbbox((0, 0), t, font=font)[2] for t in lines]
    lh = int(size * 1.3)
    total = lh * len(lines)
    if box:
        bw = max(widths) + 60
        x0 = (W - bw) // 2
        d.rounded_rectangle([x0, y - 18, x0 + bw, y + total + 6], radius=22, fill=(8, 8, 28, 150))
    for i, t in enumerate(lines):
        x = (W - widths[i]) // 2 if align == "center" else 60
        d.text((x + 2, y + i * lh + 2), t, font=font, fill=(0, 0, 0, 160))
        d.text((x, y + i * lh), t, font=font, fill=(255, 244, 214, alpha))
    img.save(path)


def wrap(text, width=58):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    lines.append(cur)
    return lines


def end_card(bg_frame, total):
    img = Image.open(bg_frame).convert("RGB").resize((W, H)).filter(ImageFilter.GaussianBlur(14))
    img = Image.blend(img, Image.new("RGB", (W, H), (6, 6, 22)), 0.55)
    d = ImageDraw.Draw(img)
    t = ImageFont.truetype(FONT_B, 120)
    s = ImageFont.truetype(FONT, 46)
    m = ImageFont.truetype(FONT, 34)
    def c(y, text, font, fill):
        w = d.textbbox((0, 0), text, font=font)[2]
        d.text(((W - w) // 2, y), text, font=font, fill=fill)
    c(250, "Lanternfolk", t, (255, 227, 163))
    c(410, "Your hands can become someone else's way home.", s, (230, 236, 255))
    c(560, "Play free in Meta Quest Browser:  lanternfolk.hayaix.tech", m, (255, 214, 140))
    c(620, "Three chapters  ·  hands only, no controllers  ·  seated", m, (200, 208, 245))
    c(680, "Built with Meta Immersive Web SDK  ·  WebXR hand tracking", m, (200, 208, 245))
    c(860, "All footage is real gameplay captured in the Immersive Web Emulator (IWER) on a desktop.", ImageFont.truetype(FONT, 28), (160, 168, 210))
    c(900, "Game audio is the game's own synthesized soundtrack. Narration: Kokoro TTS (synthetic voice).", ImageFont.truetype(FONT, 28), (160, 168, 210))
    path = os.path.join(WORK, "endcard.png")
    img.save(path)
    v = os.path.join(WORK, "endcard.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", str(END_CARD), "-i", path,
         "-f", "lavfi", "-t", str(END_CARD), "-i", "anullsrc=r=48000:cl=stereo",
         "-vf", f"fps=30,format=yuv420p,fade=t=in:st=0:d=0.8,fade=t=out:st={END_CARD - 1.2}:d=1.2",
         "-c:v", "libx264", "-crf", "17", "-c:a", "pcm_s16le", "-shortest", v])
    return v


def main():
    vo = tts()
    parts = cut_segments()
    run(["ffmpeg", "-v", "error", "-y", "-ss", "62", "-i", os.path.join(TAKES, "C.mp4"), "-frames:v", "1",
         os.path.join(WORK, "endbg.png")])
    parts.append(end_card(os.path.join(WORK, "endbg.png"), None))
    lst = os.path.join(WORK, "concat.txt")
    open(lst, "w").write("\n".join(f"file '{p}'" for p in parts))
    base = os.path.join(WORK, "base.mov")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", base])
    total = probe_duration(base)

    # Caption + title overlays (PNG) and narration timing.
    overlays = []
    srt = []
    for i, (start, text, f, dur) in enumerate(vo):
        if start >= total - END_CARD + 0.5:
            continue  # the end card already shows the closing line
        p = os.path.join(WORK, f"cap_{i:02d}.png")
        text_png(p, wrap(text), 44, H - 190 - 57 * (len(wrap(text)) - 1))
        overlays.append((p, start, start + dur + 0.4))
    for i, (start, text, f, dur) in enumerate(vo):
        def ts(x):
            return f"{int(x // 3600):02d}:{int(x % 3600 // 60):02d}:{int(x % 60):02d},{int((x % 1) * 1000):03d}"
        srt.append(f"{i + 1}\n{ts(start)} --> {ts(start + dur + 0.4)}\n{text}\n")
    open(os.path.join(HERE, "Lanternfolk_Demo.srt"), "w").write("\n".join(srt))
    title = os.path.join(WORK, "title.png")
    text_png(title, ["Lanternfolk"], 110, 120, bold=True, box=False)
    # (no title overlay on the hook: the in-game prompt is already on screen; the name follows at 0:06)
    tag = os.path.join(WORK, "tag.png")
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([40, 36, 760, 92], radius=16, fill=(8, 8, 28, 140))
    d.text((62, 46), "Real gameplay · captured in Immersive Web Emulator", font=ImageFont.truetype(FONT, 30), fill=(220, 226, 255, 220))
    img.save(tag)
    overlays.append((tag, 5.0, total - END_CARD))

    inputs = ["-i", base]
    for p, _, _ in overlays:
        inputs += ["-loop", "1", "-i", p]
    for _, _, f, _ in vo:
        inputs += ["-i", f]
    fc = []
    last = "[0:v]"
    for k, (p, a, b) in enumerate(overlays):
        fc.append(f"[{k + 1}:v]format=rgba,fade=t=in:st={a}:d=0.3:alpha=1,fade=t=out:st={max(a, b - 0.3)}:d=0.3:alpha=1[o{k}]")
        fc.append(f"{last}[o{k}]overlay=0:0:enable='between(t,{a},{b})'[v{k}]")
        last = f"[v{k}]"
    # Duck the game audio under the narration.
    duck = "+".join(f"between(t,{s - 0.2},{s + d + 0.3})" for s, _, _, d in vo)
    fc.append(f"[0:a]volume=0.9,volume=enable='{duck}':volume=0.42[game]")
    vo_base = 1 + len(overlays)
    mix = ["[game]"]
    for j, (s, _, _, _) in enumerate(vo):
        fc.append(f"[{vo_base + j}:a]aresample=48000,adelay={int(s * 1000)}|{int(s * 1000)},volume=1.6[n{j}]")
        mix.append(f"[n{j}]")
    fc.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0,alimiter=limit=0.95[aout]")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc), "-map", last, "-map", "[aout]",
         "-t", str(total), "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT])
    print(OUT, round(probe_duration(OUT), 1), "s")


if __name__ == "__main__":
    main()
