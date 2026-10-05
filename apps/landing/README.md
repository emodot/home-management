# Landing page

The marketing site: a single static `index.html` (no build step). It deploys as its own Vercel
project (`lintel-landing`, https://lintel-landing-sigma.vercel.app) with Root Directory
`apps/landing`. `vercel.json` there skips install and build, and skips deploys of commits that
don't change this folder.

Placeholders to replace before launch are marked `TODO` in `index.html`.
