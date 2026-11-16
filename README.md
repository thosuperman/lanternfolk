# Lanternfolk

A hands-first, seated WebXR game for Meta Quest, built with Meta's Immersive Web SDK (IWSDK).
Tiny lantern spirits walk across your palm to find their way home.

**Play:** https://lanternfolk.hayaix.tech, opened in Meta Quest Browser. Press Enter VR and put the controllers down.

## Requirements
Node 20.19+ (tested with 24.22) and npm. Python 3 is needed for the emulator playtest and the capture tools.

## Run locally
```bash
npm install
npx iwsdk dev up --headless --allow-browser-automation   # dev server + emulator (IWER) browser
npx iwsdk dev status                                     # local/network URLs
```
To try it on a headset on the same network, open the `network` URL shown by `dev status` and accept the local certificate.

## Test
```bash
npm run typecheck
npm test                         # 29 Vitest unit tests (pure gameplay rules)
python3 tools/playtest.py        # 22-check end-to-end run incl. failures (needs the dev server)
```

## Build and deploy
```bash
npm run build                    # static site in dist/
./tools/deploy.sh                # typecheck + tests + build + S3 sync + CloudFront invalidation (AWS profile hayaitech)
python3 tools/build_pages.py     # regenerate about/support/privacy/terms/credits pages in public/
```

## Code map
| Path | Purpose |
|---|---|
| `src/game/logic.ts` | Pure, unit-tested rules: hand support, bridge, lift, palm surface, pinch, snap |
| `src/game/hands.ts` | WebXR hand joints → island-local samples every frame |
| `src/game/folk.ts` | Spirit state machine and procedural "acting" |
| `src/game/levels.ts` | Level layouts |
| `src/game/game.ts` | Main system: placement, flow, hints, community, finale |
| `src/game/scenery.ts`, `handVisual.ts` | Procedural meshes, glow hand |
| `src/game/audio.ts`, `music.ts` | Synthesized SFX and generative score |
| `tools/` | Emulator playtest, footage capture (`film.py`, `record.mjs`, `render_audio.mjs`), deploy, page generator |

All art and audio are generated in code. See `public/credits.html` for third-party licenses.
