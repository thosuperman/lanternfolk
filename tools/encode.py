#!/usr/bin/env python3
"""Encode screencast frames (variable timing) into a constant 30 fps MP4."""
import json
import os
import subprocess
import sys

src = sys.argv[1]
out = sys.argv[2]
frames = json.load(open(os.path.join(src, "frames.json")))
if not frames:
    sys.exit("no frames")
lines = []
for i, f in enumerate(frames):
    dur = (frames[i + 1]["t"] - f["t"]) if i + 1 < len(frames) else 1 / 30
    lines.append(f"file '{os.path.abspath(f['file'])}'")
    lines.append(f"duration {max(dur, 0.001):.4f}")
lines.append(f"file '{os.path.abspath(frames[-1]['file'])}'")
lst = os.path.join(src, "list.txt")
open(lst, "w").write("\n".join(lines))
subprocess.run([
    "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst,
    "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", out,
], check=True)
print(out, len(frames), "frames", f"{frames[-1]['t'] - frames[0]['t']:.1f}s")
