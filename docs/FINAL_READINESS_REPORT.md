# Final Readiness Report — Lanternfolk

Status as of **2026-11-16 (JST)**. Deadline **2026-11-18 12:00 PT = 2026-11-19 05:00 JST**.

**Verdict:** the entry is technically ready. It is **not yet submitted**. Three manual steps remain, and only you can do them (marked **[YOU]**).

| # | Requirement (official rules) | Status | Evidence | Action |
|---|---|---|---|---|
| 1 | Submitter is a Meta VR Start member by submission time | PASS | Start welcome email received 2026-11-15 | Keep the email |
| 2 | Meta account with Developer Access | PASS | Developer Dashboard org "HayAiX" (your screenshot) | — |
| 3 | Registered on the Devpost hackathon | UNKNOWN | — | **[YOU]** click "Join Hackathon" |
| 4 | Submitted before Nov 18 12:00 PT | FAIL (not yet) | — | **[YOU]** submit by Nov 18, 22:00 JST (buffer) |
| 5 | Division: New Experience (built after Sep 24, 2026) | PASS | Project scaffolded and built Nov 15–16, 2026 (git history starts Nov 15) | — |
| 6 | Track: Gaming | PASS | Hands-first casual puzzle game | — |
| 7 | Fully usable with hands end-to-end | PASS (emulator) | 22/22 emulated-hand playthrough checks (success, failure and retry in all three chapters) + 29 unit tests, no controller input | Not hardware-verified |
| 8 | Seated / 2 ft radius | PASS (by design) | Grove placed 62 cm ahead, 36 cm below the eyes; no locomotion | — |
| 9 | Satisfying in ≤ 10 min; fast cold start | PASS (by design) | Three short chapters; scripted run about 4 min, first-time target 8–12 min (unmeasured); ~1.8 s to download the main bundle (Japan) | — |
| 10 | Build accessible to judges (WebXR link) | PASS | https://lanternfolk.hayaix.tech (HTTPS, CloudFront) | Keep online and **unchanged** until winners (~Dec 11) |
| 11 | Free to access | PASS | No login, no payment | — |
| 12 | Demo video < 3 min, public on YouTube/Vimeo | PASS (uploaded: https://youtu.be/RVbo4JKe-rY) | `video/Lanternfolk_Demo.mp4` (2:37) + `.srt` | **[YOU]** upload as **Public**, add captions file, paste link |
| 13 | Video shows real gameplay (emulator allowed) | PASS | All gameplay shots captured from the running app in IWER; disclosed on screen | — |
| 14 | Submission form fields | READY | `SUBMISSION_PACKAGE.md` | **[YOU]** paste; choose target launch date; add email |
| 15 | English | PASS | Game, site, video, text | — |
| 16 | Original work / licensing | PASS | All art and audio generated in code; MIT/ISC libraries listed on `credits.html`; narration voice Kokoro (Apache-2.0) | — |
| 17 | No third-party branding / implied Meta endorsement | PASS | Pages state "not affiliated with or endorsed by Meta"; Meta mentioned only factually | — |
| 18 | Content suitable (10+/13+) | PASS | Non-violent, no user content | — |
| 19 | Policies: privacy | PASS | `privacy.html`; verified no cookies, web storage, analytics or third-party requests | — |
| 20 | No changes after the deadline | PLAN | Do not run `tools/deploy.sh` after Nov 18 12:00 PT | — |

## Known risks (honest)
- **No physical Quest testing.** ≥ 60 fps and real hand-tracking feel are unverified. Mitigations: light scene (≈74 draw calls), smoothing, generous zones, safe fallbacks.
- Judges might keep controllers in hand. The game shows "Use your hands" after 2.5 s without hands.
- If AWS were down during judging, the build would be unreachable (low risk). The deploy script can redeploy the same build.

## What you need to do (≈20 min)
1. Watch `video/Lanternfolk_Demo.mp4` once. Check the narration and sound.
2. Upload it to YouTube: title "Lanternfolk — hands-first VR (Meta VR Start 2026)", visibility **Public**, upload `Lanternfolk_Demo.srt` as English subtitles.
3. On Devpost: Join Hackathon → Enter a Submission. Paste the fields from `SUBMISSION_PACKAGE.md` and upload the images from `submission/images/`. Add the YouTube link, select Gaming + New Experience, then **Submit**.
4. Optional: open https://lanternfolk.hayaix.tech on any Quest you can borrow, to sanity-check hands and frame rate.
