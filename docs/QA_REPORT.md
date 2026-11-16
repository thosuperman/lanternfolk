# QA Report — Lanternfolk (three-chapter build)

Last run: 2026-11-16 (JST). **All verification is in the Immersive Web Emulator (IWER, emulating a Meta Quest 3) in headless Chromium on macOS. Nothing here was tested on a physical headset.**

## Automated tests

| Suite | Result | Covers |
|---|---|---|
| Vitest (`npm test`) | **29/29 pass** | Hand support, bridge stepping and speed, lift boarding/landing, palm surface (palm up and down), **balance model** (calm palm never drains; steep tilt or a jolt slips within ~1 s; recovery; jitter tolerance), pinch/touch/grab/snap, swinging-branch capsules, star drift range, level layouts (every palm gap is too wide to hop) |
| Emulator playthrough (`python3 tools/playtest.py`) | **22/22 pass** | See below |
| Typecheck, production build | Pass | |

### Playthrough (emulated hand tracking, no controllers)
**Chapter 1, The Moonlit Crossing**
1. A touch wakes the shy spirit; it walks to the first gap and asks for help.
2. It crosses the first gap on a flat palm.
3. **Failure:** a steeply tilted palm makes it lose balance.
4. It floats back to its checkpoint (the same gap), dizzy but fine.
5. **Retry:** with a steady palm it crosses the wide gap and reaches the tree.
6. Transition to chapter 2.

**Chapter 2, The Rising Lanterns**
7. The playful spirit asks for a lift.
8. It climbs onto the palm.
9. **Failure:** shaking the hand makes it slip back.
10. **Failure:** carrying it into a swinging branch knocks it back to the pad.
11. Up and over the branch to the middle ledge (a checkpoint).
12. The second lift, past the other branch, to the top.
13. Transition to chapter 3.

**Chapter 3, The Starlight Reunion**
14. Both spirits wake and ask for the leaf.
15. The leaf is laid; both cross and reach the tree.
16. The star is scooped onto the open palm.
17. **Failure:** shaking makes the star roll off and float home.
18. **Retry:** it is scooped again.
19. It is carried up steadily and set on the tree.

**Finale and ending**
20. The spirits gather, and the first friend comes to say thank you.
21. The music bell toggles the music.
22. The replay lantern restarts the game.

Earlier builds also verified recovery from tracking loss mid-crossing (hover, then drift back) and mid-ride (float to the nearest pad, re-board on reacquire). Those code paths are unchanged.

## Performance (emulator measurements, not Quest)
- Measured per view in this build: chapter 2 has 84 draw calls (~10.8k triangles); chapter 3 and the finale have 90 draw calls (~11.2k triangles).
- Drifting lanterns and stars are single `Points` draws.
- No shadows and no post-processing; one point light. Foveation and a 72 Hz request are applied where supported.
- `?stats` shows an in-world fps readout.
- **Unverified:** real frame rate on Quest 3/3S.

## Audio
- Each mood (calm, playful, mysterious) and the tension layer was rendered offline: steady level, peak 0.29, no clipping.
- A limiter and a voice cap keep stacked cues soft.
- The live audio has not been listened to in a headset.

## UX notes (emulator, scripted)
- The scripted run takes about 4 minutes with no hesitation. First-time players will take longer; the design target is roughly 8–12 minutes, which is **not measured**.
- Failures are always recoverable: there is a checkpoint at each gap or pad, the spirit is dizzy for 1.8 s, and you can retry automatically. Prompts are one line ("Whoa! Too wobbly — It's okay. Let's try again").

## Bugs found and fixed in this round
- The spirit could slip the moment it climbed onto a palm held beside a branch. Fixed with a 0.6 s grace period after boarding, and branch 2 was moved clear of the ledge and the landing.
- A tilted palm produced the "Where did your hand go?" message. The message now depends on whether a hand is present.
- The star could be re-scooped by a hand that was still moving. Scooping now requires a calm hand.
