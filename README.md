# karlsteltenpohl.com

Personal portfolio as an ASCII terminal. Type commands (`help`, `ls`, `open <slug>`)
or just click — every project from the previous site lives at the same
`/projects/<slug>` URL.

## Stack

- Vanilla HTML/CSS/JS + [Vite](https://vitejs.dev). One runtime dependency:
  [three](https://threejs.org) for the WebGL glitch reveal when media opens
  (lazy-loaded, skipped under `prefers-reduced-motion` / no WebGL / no JS).
- Build-time prerender: `scripts/prerender.mjs` stamps a real static HTML page
  per project (full content, per-page meta/OG, sitemap), and `scripts/verify.mjs`
  fails the build unless all 26 projects are present and complete.
- Deployed to GitHub Pages by `.github/workflows/deploy.yml` on push to `main`.

## Develop

```sh
npm install
npm run dev       # dev server
npm run build     # dist/ = vite build + prerender + verify
npm run preview   # serve dist/
```

## Content

`src/data/projects.json` is the canonical content (migrated once from the old
Squarespace site by `scripts/migrate.mjs` — do not re-run it; edit the JSON).
Images live in `public/images/projects/<slug>/`.

## Commands

`help` `ls` `open <slug>` `about` `contact` `home` `clear` `crt on|off` `glitch`
— plus tab completion, arrow-key history, and a few easter eggs.
