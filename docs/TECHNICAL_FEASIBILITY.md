# Technical Feasibility

## Stack (verified 2026-11-15)

| Piece | Version | Why |
|---|---|---|
| Meta Immersive Web SDK (`@iwsdk/core`) | 1.1.0 (released 2026-11-13) | Officially suggested for WebXR entries; ECS + Three.js; hand tracking; bundled emulator tooling |
| Three.js | `super-three@0.185.0` (aliased by IWSDK) | Rendering |
| IWER (Immersive Web Emulator) via `@iwsdk/vite-plugin-dev` + `@iwsdk/cli` 1.1.0 | 1.1.0 | Desktop emulation of a Meta Quest 3 with hand tracking, scriptable from the CLI |
| Vite | 7.x | Dev server / build |
| Node | 24.22.1 (rules ask ≥ 20.19) | |
| Hosting | AWS S3 + CloudFront at `lanternfolk.hayaix.tech` | Same setup as the user's other projects; rules allow any host |

The scaffold was created with the official `npm create @iwsdk@1.1.0 app -- --yes --target vr`.

## Proof of concept (emulator), done before building the game

| # | Milestone | Result | Evidence |
|---|---|---|---|
| 1 | App launches in the emulator | PASS | Managed headless Chromium via `npx iwsdk dev up`; screenshots |
| 2 | Immersive session starts | PASS | `npx iwsdk xr enter` → `sessionActive: true` |
| 3 | Simulated hands available | PASS | `xr set-input-mode hand`; 25 joints read through `XRFrame.fillPoses`/`getJointPose` |
| 4 | Select and manipulate with a hand | PASS | Pinch events (`selectstart`/`selectend`) observed; our own pinch-grab of leaf and star |
| 5 | Release | PASS | Leaf/star snap or drift home on release |
| 6 | Puzzle completion | PASS | Scripted playthrough reaches the finale (`tools/playtest.py`) |
| 7 | Same architecture hands-first on Quest | **By design, unverified on hardware.** The game reads standard WebXR Hand Input joints (`XRHand`, `XRFrame.fillPoses`, `fillJointRadii`, `gamepad.buttons[0]` for the system pinch), which Quest Browser exposes | — |

## Interaction architecture

- `src/game/hands.ts`: every frame, reads the 25 joints per hand from the XR frame, converts them into the island's local space, and computes index tip, thumb tip, pinch point, and pinch state (distance hysteresis 2.2 cm / 4.0 cm, OR the runtime's select button).
- `src/game/logic.ts`: pure, unit-tested rules.
  - **Support:** the highest tracked joint within 4.5 cm horizontally of a point gives the surface height. This is orientation-agnostic, so palm up, palm down and a loose fist all work.
  - **Bridge:** the spirit advances only while the next centimetre is supported (by the hand or the ground) within ±9 cm of path height. It hops gaps of up to 5 cm and hovers, then drifts back, if the hand disappears.
  - **Lift:** boards when a hand is offered at the pad (−6 cm … +11 cm), rides on the palm centre lifted 2 cm along the palm normal (flipped to point up, so it works palm-up or palm-down; smoothed), never sinks below its home island, and lands within 10 cm of the ledge.
  - **Balance:** tilt beyond ~40°, speed beyond 0.35 m/s, and jolts beyond 0.8 m/s drain balance; a calm palm recovers it. At zero the rider (or the star) slips back to its checkpoint.
  - **Branches:** swinging capsules; touching one while riding (after a 0.6 s boarding grace) knocks the spirit back.
  - **Touch:** index tip within 4 cm. **Pinch-grab:** pinch point within 6–7 cm. **Snap:** within 7.5–8 cm.
- The stock SDK hand and ray visuals are hidden; a custom glowing joint-and-bone hand (2 draw calls per hand) shows exactly what the gameplay sees.

## Emulator vs. real Quest: risks and mitigations

| Risk | Why the emulator can't prove it | Mitigation in code |
|---|---|---|
| Hand-tracking jitter and dropouts | IWER hands are perfectly stable | Smoothing on standing height and on riding (exponential); hysteresis on pinch; 0.3–1.2 s grace before reacting to loss; spirits hover, never fall |
| Real hand sizes and poses differ | IWER uses canned poses | Orientation-agnostic support test, generous radii, hop-over for small gaps |
| Joint radius availability | Emulator provides radii | Clamped 4–20 mm with a 10 mm fallback |
| Frame rate on Quest 3/3S | Desktop GPU | ~74 draw calls / ~8.4k triangles per eye in the busiest state (measured in the emulator), no shadows, no post-processing, one point light, Lambert/Basic materials, instanced flowers and hand joints |
| Audio autoplay | Desktop is lenient | AudioContext created/resumed on the Enter VR click; game still works silently if audio fails |
| Scene placement for different seated heights | Fixed emulator head | Grove placed relative to the head at XR start (62 cm ahead, 36 cm below the eyes); re-placed on reference-space `reset` (recentre) |
| FoV | Emulator FoV differs | Active zone always rotates to the front; prompts float just above the action |

**What remains unverified without hardware:** real 60+ fps, real tracking feel, comfort of the hold durations, and Quest Browser specifics. We never claim these as tested.

## Testing tools built

- `tools/playtest.py`: 22-check scripted end-to-end run with emulated hands, including every failure and recovery path. It covers wake, bridge, tracking loss mid-crossing, lift, tracking loss mid-ride and reacquisition, leaf pinch-and-place, star, spirits gathering, the thank-you, the music toggle, and replay.
- `test/*.test.ts` (Vitest): 29 unit tests for the rules and level layouts.
- `tools/film.py`, `tools/record.mjs`, `tools/render_audio.mjs`: real gameplay capture plus re-render of the game's own audio for the trailer.
