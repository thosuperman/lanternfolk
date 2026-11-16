# Competition Research — Meta VR Start Developer Competition 2026

Researched 2026-11-15 (JST). Primary sources were read in a browser because Devpost blocks automated fetches.
**Confirmed** = read on an official page. **Unverified** = secondary source or inference.

## Sources

| Source | URL |
|---|---|
| Competition overview (official) | https://start-developer-competition-26.devpost.com/ |
| Official Rules (official) | https://start-developer-competition-26.devpost.com/rules |
| Meta VR Start program | https://developers.meta.com/horizon/discover/programs/start/ |
| 2025 winners (Meta blog) | https://developers.meta.com/horizon/blog/meta-horizon-start-developer-competition-meet-the-winners/ |
| IWSDK 1.0 launch post (mentions 2025 IWSDK winners, emulator) | https://developers.meta.com/vr/blog/immersive-web-sdk-1-0/ |
| Start approval delays (forum) | https://communityforums.atmeta.com/questions-and-discussions-26/start-application-successfully-submitted-but-no-reply-after-1-5-weeks-and-i-can-submit-again-180360 |

## Key facts

| Topic | Finding | Status |
|---|---|---|
| Entry period | Sep 24, 2026 10:00 AM PT → **Nov 18, 2026 12:00 PM PT** (= **Nov 19, 05:00 JST**) | Confirmed (Rules) |
| Judging / winners | Judging ~Nov 18 → Dec 9; winners on or around Dec 11, 2026 | Confirmed (Rules) |
| Eligibility | 18+, not in excluded regions; Meta account with Developer Access; **submitter must be a Meta VR Start member by submission time** | Confirmed (Rules §2) |
| Start membership | User received the Start welcome email on 2026-11-15 | Confirmed by user |
| Tracks | Entertainment, Gaming, Productivity | Confirmed |
| Divisions | New Experience (conceived and built after Sep 24, 2026) or Adapted/Significantly Updated | Confirmed |
| Hard requirement | **Fully usable with hands end-to-end**; controllers optional | Confirmed |
| Design guidelines | Seated ("airplane seat test", 2 ft radius), fast cold start, clean pause/resume, satisfying in ≤ 10 min, original (not a wrapper) | Confirmed |
| WebXR allowed | Yes. IWSDK (WebXR) apps submit a **public link** (GitHub Pages or any host: Vercel, AWS, …) | Confirmed |
| Store publishing | Not required. APK entries use a "Competition" release channel; WebXR uses a link | Confirmed |
| Physical Quest required? | Not stated as required to enter. Video may show footage **"as viewed on a Meta VR device, via XR Simulator, or another equivalent emulator"** | Confirmed |
| Video | **< 3 minutes**, public on YouTube or Vimeo, real gameplay; "Don't lean on AI-generated video to carry the pitch" | Confirmed |
| Form fields | Name, tagline (140 chars), track, division, description (~≤500 words: inspiration, how built, future plans), optional hand-interaction description, target launch date, team members | Confirmed |
| Availability | Project must stay free and accessible until winners are announced; no changes after the deadline | Confirmed |
| Originality / 3rd party | Must be original; third-party tools/code/assets must be properly licensed; no third-party logos/brands; English or English subtitles | Confirmed |
| AI tools | Rules encourage AI tooling for development (overview: "accelerate your development with AI tooling"). No ban on AI-assisted code. Judges may use AI to assist judging | Confirmed |
| AI-generated assets | No explicit prohibition found; video guidance discourages AI-generated video | Confirmed (no rule found) |
| Judges' hardware | Not stated on the rules page. A third-party guide says Quest 3/3S | Unverified |
| How judges open WebXR | Implied: Meta Quest Browser via the submitted link | Unverified (inference) |

## Judging (Stage 2, equal weights 25% each — confirmed)

1. **Innovation & creativity**: originality, ambition, track relevance, unique use of device capabilities (spatial depth, **hands-first**, gaze, passthrough…), drives repeat usage.
2. **Experience design**: seated/hands-first journey, intuitive onboarding; passthrough only if purposeful; **FoV-aware** (keep essential UI in a narrow FoV).
3. **Technical implementation**: reliability, platform features (hand tracking, …), **≥ 60 fps on Quest**, bug-free.
4. **Polish & presentation**: UI/UX, art direction, **sound design**, quality of text/images/video; real gameplay in the video.

Stage 1 is pass/fail viability (fits theme, uses required features).

## Prizes (confirmed)

- Track prizes per division: Gaming and Entertainment $100k winner / $50k runner-up; Productivity $70k / $35k.
- Special awards ($25k each): Best Social & Multiplayer, Best Agentic Interaction, Best Reason to Come Back, **Best First Five Minutes**, Best Accessibility Forward, **Boldest Original Concept**. Judge's Choice ×2 ($20k).
- One prize per entry.

## 2025 winners (Meta blog + forum; descriptions partly unverified)

- Best Casual Game: *Tiny Golf* (MR mini golf with hand controls + course creator).
- Best Hand Interactions: *Hand Survivor*, *Pocket Lands* (hand-shaped voxel diorama sandbox), *Awesome Hand*.
- Best Immersive Web SDK: *The Nanauts* (small AI explorers in your room, MR + passthrough) and *Dun Jun* (hands-only action arcade).
- Pattern: hands-first is central; small characters living near the player's body (Nanauts) and miniature dioramas (Pocket Lands) were rewarded; no published "why it won" notes found.

## Saturation check (for concept selection)

| Space | Closest titles | Crowding |
|---|---|---|
| Reassemble a broken diorama (EchoFold) | *Puzzling Places* (hand-tracked 3D jigsaw dioramas), *Fractured*, *Tiny Restorations* | Moderately crowded |
| Seasons / miniature world toy | *Pocket Lands* (2025 winner) | Light, but a recent winner |
| Pop-up storybook | *Baba Yaga*, *Paper Birds* | Light, mostly narrative |
| Node workflow tool | *CAD Nodes*, research prototypes | Sparse, weak prize fit |
| Guide tiny creatures (Lanternfolk) | *Silhouette* (guide shadow creatures with hand shadows), *Tiny Flock* (guide sheep in dioramas), *Ghost Giant* (controllers) | Genre exists; **"your real palm is the bridge / elevator" not found** in our searches |

Not exhaustive: new Quest titles may exist that our searches missed.

## Implications for us

- WebXR + IWSDK + emulator footage is an explicitly allowed path for a developer without a headset.
- Must be completable with hands only; seated; fast to understand; ≤ 10 min.
- Deadline buffer: submit well before **Nov 19, 05:00 JST**.
- Main manual risks: membership (now resolved), YouTube upload, Devpost submission (only the user can do these).
