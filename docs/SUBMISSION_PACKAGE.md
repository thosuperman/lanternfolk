# Submission Package — Devpost form text (copy-paste ready)

All claims below match what was built and tested (see `QA_REPORT.md`). Items marked **[YOU]** need your input or action.

## Basics

| Field | Value |
|---|---|
| Submission name | **Lanternfolk** |
| Tagline (≤140) | Lend a hand, literally. Carry tiny lantern spirits across your palm, past swinging branches, and home in a hands-only VR game. |
| Track | **Gaming** |
| Division | **New Experience** (conceived and built Nov 15–18, 2026) |
| Project link | https://lanternfolk.hayaix.tech (open in Meta Quest Browser → Enter VR) |
| Video | **https://youtu.be/RVbo4JKe-rY** (uploaded 2026-11-16) (file: `video/Lanternfolk_Demo.mp4`, ~2:38, subtitles: `video/Lanternfolk_Demo.srt`) |
| Target launch date | **[YOU]** suggestion: "Q1 2027 (free, Meta Quest Browser; Horizon Store PWA to follow)" |
| Team | Tho Nguyen, solo developer (design, code, art, audio). **[YOU]** add your email in the form |
| Built with (tags) | webxr, immersive-web-sdk, three.js, typescript, vite, web-audio-api, hand-tracking, meta-quest, aws |

## Description (≈490 words; Devpost suggests ≤ 500)

**Inspiration**
Most VR games turn your hands into controllers. We wanted your hand to be part of the world: a bridge, an elevator, a safe place. Lanternfolk is a small story built on one idea: *your hands can become someone else's way home.*

**What it does**
A miniature moonlit grove floats in front of you while you sit. Lantern spirits are stranded on islands that have drifted apart. There are three chapters:
- **The Moonlit Crossing:** touch a shy spirit to wake it, then hold your palm across two gaps so it can walk over your hand. Tip or jerk your hand and it wobbles, slips and floats back to its last safe spot, dizzy but fine.
- **The Rising Lanterns:** a playful spirit climbs onto your palm. Lift it up two ledges past slowly swinging branches; touch a branch and it's knocked back to try again.
- **The Starlight Reunion:** pinch a glowing leaf into a bridge for two friends, then scoop the last star onto your open palm and carry it, steadily, to the top of the great tree.

Failure is gentle but real: checkpoints, automatic retries and encouraging one-line prompts, never punishment. Each spirit has a personality (shy, playful, brave, gentle) and shows emotions: curiosity, trembling, surprise, dizziness, joy, gratitude. Rescued spirits stay by the tree, watch your hands, look worried when a friend slips, and cheer each arrival. Every rescue warms the grove, and the soundtrack shifts between calm, playful and suspenseful moods. In the finale the spirits gather, and the first friend you helped comes to thank you.

**How we built it**
TypeScript with Meta's Immersive Web SDK (IWSDK 1.1) and Three.js, served as a static WebXR site. Each frame we read the 25 WebXR hand joints and turn them into forgiving rules: the top of your tracked hand is walkable ground, riders stand on the palm centre, and a balance model reacts to palm tilt, speed and sudden jolts while tolerating tracking jitter. Everything you see and hear is generated in code, including an original adaptive score in Web Audio.

**Challenges**
We had no headset. The game was built and tested in the Immersive Web Emulator with a scripted emulated-hand playthrough (22 checks covering every success, failure and recovery path) and 29 unit tests. We designed defensively for real tracking: smoothing, generous zones, and spirits that hover and float to safety instead of falling.

**Accomplishments and lessons**
A complete three-chapter game in a few days, kept light for standalone hardware. Small acting beats (a hesitation, a wobble, a glance back at your hand) mattered more than extra mechanics.

**What's next**
Real-device tuning on Quest 3/3S, more chapters, a daily "lost spirit".

**Honesty note:** the video is real gameplay captured in the Immersive Web Emulator, not on a physical Quest. Quest performance and the first-time play length (designed for roughly 8–12 minutes) have not been measured; our scripted run takes about 4 minutes.

## Hand interactions (optional field)
Lanternfolk is completable with hands only:
- **touch** (index fingertip within 4 cm) wakes spirits and presses the music bell and replay lantern;
- an **open palm** becomes terrain: spirits walk on the top surface of your tracked hand, or board it and ride on the palm centre; the hand glows when it is in a spot a waiting spirit can use;
- **steadiness matters**: a balance model watches palm tilt, speed and sudden jolts (tracking jitter is tolerated). Riders wobble, then slip back to their last safe spot and retry; the final star rolls off the same way;
- **pinch** (thumb–index distance with hysteresis, or the system pinch) grabs the leaf and the star, which snap into place when released nearby.

Ghost-hand hints appear only after a few seconds of hesitation, and fade as soon as your hand approaches. If tracking drops, spirits hover and drift back to safety, and puzzle progress is kept. What excites us about VR: interfaces disappear when your body itself becomes the interaction.

## Images (upload in this order)
`submission/images/`: `cover_3x2.png` (thumbnail), then `01_palm_bridge.png`, `02_wobble_slip.png`, `03_branch_bump.png`, `04_palm_lift.png`, `05_leaf_bridge.png`, `06_star_carry.png`, `07_finale.png`. All are frames of real emulator gameplay, cropped and captioned.

## Testing instructions for judges
1. On a Meta Quest 3/3S, open **https://lanternfolk.hayaix.tech** in Meta Quest Browser.
2. Make sure hand tracking is enabled. Put the controllers down, sit, and press **Enter VR**.
3. Follow the spirits' one-line prompts. If your hands don't appear, set the controllers down and make sure hand tracking is enabled in the headset settings. If the grove is badly placed, use the headset's recenter. The small moon-bell on the left of the grove toggles music.
4. Optional: open **https://lanternfolk.hayaix.tech/?stats** to show a small in-world frame-rate readout beside the moon-bell.
