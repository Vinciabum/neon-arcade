# Neon Arcade

Original HTML5 games, published at **[just1game.com](https://just1game.com)**.
Every game is built in-house with vanilla JavaScript and HTML5 Canvas.

## Structure

| Path | Purpose |
|---|---|
| `games.json` | Single source of truth for all game metadata |
| `content/notes/` | Dev-note articles — `index.json` for metadata, one HTML fragment per post |
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

Twenty games are published. `games.json` is the authoritative list.

Each entry carries a `notes` array — two or three paragraphs of design notes rendered
into the landing page. That field is the reason the game pages are not twenty copies of
one template, so a new game is not finished until it has one.

## Dev notes

Long-form posts live in `content/notes/`. Add one by writing the body as an HTML
fragment at `content/notes/<slug>.html` (no `<h1>` — the template writes it) and adding
a record to `content/notes/index.json`. The build refuses anything under 400 words or
with a description outside the 70–170 character range the output SEO gate enforces.

## Third-party assets

**There are none.** Every image, sound and line of code served from this domain is
original work:

- Game graphics are drawn at runtime in canvas code, or are SVG files drawn for this site
  (`jumper.svg`, `cactus.svg`, `coin.svg`), or are inline base64 SVG data URIs.
- All audio is synthesised with the Web Audio API. There are no sound files.
- Thumbnails and share cards are generated from real screenshots of the games running.

The one exception is type: Fredoka and Outfit, plus a display face in nine of the older games, are
served from Google Fonts rather than this domain. They are open-licence faces, and `/credits/` and
`/privacy/` both say so. A new game should use the system face and load nothing.

An earlier version of the site used three downloaded itch.io sprite packs across four
games. Their licences were never confirmed as permitting commercial use, so the files
were deleted and those games were redrawn in code. Re-introducing a third-party asset
means confirming its licence first and recording it on `/credits/`, which is generated
from `build.js`.
