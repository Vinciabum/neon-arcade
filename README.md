# Neon Arcade

Original HTML5 games, published at **[just1game.com](https://just1game.com)**.
Every game is built in-house with vanilla JavaScript and HTML5 Canvas.

## Structure

| Path | Purpose |
|---|---|
| `games.json` | Single source of truth for all game metadata |
| `play/<slug>.html` | The game itself (self-contained, `noindex`) |
| `templates/` | Page templates |
| `build.js` | Static site generator + validation gates |
| `tools/` | Path rules, validation, rendering, thumbnail capture |
| `assets/thumbs/` | Generated WebP thumbnails |

Everything else at the repo root is **generated** — do not edit by hand.

## Adding a game

1. Drop the self-contained game at `play/<slug>.html`
2. Add an entry to `games.json` — including at least two `faq` entries
3. `npm run shoot -- <slug>` to capture the thumbnail
4. `npm run og -- <slug>` to build the 1200x630 share card
5. `npm run verify -- <slug>` to run the technical and play-test gates
6. `npm run build`
7. Commit and push — GitHub Actions deploys

The build **fails** if a thumbnail or share image is missing, a slug is duplicated,
a file is oversized, a required field is absent, the FAQ is thin, authoring comments
leaked into the output, or a generated page is missing its canonical, share image,
single `h1` or valid JSON-LD. This is deliberate: each of those checks exists because
that exact mistake shipped to production once.

## Commands

```bash
npm install
npx playwright install chromium
npm test          # validation and render tests
npm run build     # generate the site
npm run shoot     # regenerate all thumbnails from live gameplay
npm run og        # regenerate all 1200x630 share cards from the thumbnails
npm run verify    # run every game through the technical and play-test gates
```

## Games

Nine games are published. `games.json` is the authoritative list.

## Third-party assets

Most art is generated in code (SVG, canvas drawing). These raster sprites came from
downloaded asset packs and are still in use:

| File | Used by | Origin |
|---|---|---|
| `assets/soldier_idle.png`, `assets/orc_walk.png` | Neon Dodge | itch.io [Tiny RPG Character Asset Pack](https://shubibubi.itch.io/tiny-rpg) |
| `assets/dino/png/1x/raptor-*` (9 files) | Dino Jump | itch.io raptor sprite pack |
| `assets/wood_bridge.png`, `assets/egg_item.png` | Cyber Snake, Neon Rise | itch.io Sprout Lands pack |

**Licence status: unverified.** These packs must be confirmed to permit commercial
use before the site carries advertising or the games are submitted to a game portal.
If a licence does not permit it, replace the sprite or set that game to
`"status": "draft"` in `games.json`.

Icons: emoji and CSS graphics.
