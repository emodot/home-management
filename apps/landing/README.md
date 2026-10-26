# Landing page

The marketing site: static HTML pages sharing one stylesheet (`styles.css`). No build step and no
JavaScript. It deploys as its own Vercel project (`lintel-landing`,
https://lintel-landing-sigma.vercel.app) with Root Directory `apps/landing`. `vercel.json` there
skips install and build, serves clean URLs (`/kitchen` for `kitchen.html`), and skips deploys of
commits that don't change this folder.

| Page                         | File             |
| ---------------------------- | ---------------- |
| Home                         | `index.html`     |
| Expenses                     | `expenses.html`  |
| Kitchen                      | `kitchen.html`   |
| Upkeep (tasks and providers) | `upkeep.html`    |
| Together (the household)     | `together.html`  |
| Joining                      | `join.html`      |
| Questions                    | `questions.html` |
| Not found                    | `404.html`       |

The header, menu and footer are repeated in each page: change them in all of them.

Design ("the doorway", like Lintel's emails): each page opens under a deep navy beam with a lit
blue edge, content sits in a white opening between fine jambs, and a threshold slab comes before the
footer. Geist and Geist Mono (Fontsource on jsDelivr), the app's colours, and its icons (Lucide,
inlined). Light and dark follow the visitor's system setting; the phone menu is a `<details>`
disclosure.

The content describes what the app actually does; keep it in step when features change. The
product panels are drawn in HTML from example data (captioned "Example …"), not screenshots.
Sign-in links point at the app, https://hm-amber.vercel.app. The favicons are copies of the app's
(`apps/web/public`).

Preview locally with the `landing` entry in `.claude/launch.json` (`serve` on port 4321, which
handles clean URLs like Vercel).
