# Idea Evaluation

Internal selection weights (not the official rubric): Innovation 20%, Experience & hand interaction 20%, Feasibility without a headset 20%, Visual polish achievable 15%, Competitive differentiation 15%, Demo readiness 10%. Scores are 0–10 judgements made on 2026-11-15 from the research in `COMPETITION_RESEARCH.md`.

| Candidate | Innov. | Hands | Feasible | Visual | Differ. | Demo | **Weighted** |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Lanternfolk** (new): your palm is the bridge/elevator for tiny lantern spirits | 8 | 9 | 7 | 7.5 | 7.5 | 8 | **7.85** |
| A. EchoFold: align fragments to restore a diorama | 5 | 6 | 8 | 7 | 4.5 | 8 | 6.3 |
| B. Pocket Seasons: change seasons of a miniature world | 6 | 7 | 7 | 7.5 | 5 | 7 | 6.6 |
| C. StorySphere: interactive pop-up storybook | 6 | 6 | 6 | 6 | 6 | 6 | 6.0 |
| D. FlowWeave: hand-built workflow nodes | 5 | 6 | 7 | 5 | 6 | 6 | 5.85 |

## EchoFold (initial idea), critical review

- **Originality:** weak. *Puzzling Places* already owns "hand-tracked diorama reassembly" on Quest, and *Fractured* and *Tiny Restorations* sit close by.
- **Hand interaction:** grab-and-rotate. It works but isn't special to hands; the same game plays fine with a mouse, which hurts Boldest Original Concept ("would it fall apart on another platform?").
- **Depth:** alignment puzzles need a lot of handcrafted content to stay interesting, which is hard in 3 days.
- **Feasibility:** high (pinch-grab is emulator-testable).
- **Verdict:** feasible but undifferentiated. Rejected.

## Why Lanternfolk won the selection

- **The hand *is* the world.** Spirits walk across your real palm and ride it up a cliff. This can't exist without hand tracking and spatial presence, which targets *Boldest Original Concept*.
- **10-second moment:** a sleeping light, a touch, and a tiny creature stepping onto your hand. It's immediately readable in the first minute, which targets *Best First Five Minutes*.
- **Emotional hook** (care for small creatures) rather than abstract puzzles.
- **Emulator-testable:** the mechanics only need joint positions (`XRFrame.getJointPose`/`fillPoses`), touch and pinch, which the Immersive Web Emulator simulates.
- **Cheap to make beautiful:** low-poly procedural diorama, emissive lanterns, additive glow sprites, and synthesized audio. No asset pipeline is needed.

**Main risks:**
1. Real hand-tracking jitter on Quest (mitigated by smoothing, generous zones, and orientation-agnostic support).
2. Arm fatigue (each hold is short).
3. Similarity to *Silhouette* and *Tiny Flock* in "guide small creatures", while the mechanic itself differs (body as terrain).
4. No real-device validation.

**Track / division:** Gaming, New Experience. **Special awards:** Best First Five Minutes, Boldest Original Concept, and possibly Best Accessibility Forward (one hand is enough, there's a hands-only music toggle, and no text walls).

**Complexity:** medium. About 3.9k lines of game TypeScript (as built), no external art or audio assets.
