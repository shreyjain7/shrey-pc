# shrey-pc

An interactive 3D portfolio for **Shrey Jain** — a CRT computer sitting on a desk.
Click the monitor, the camera flies in, the machine boots, and the CV is a small
operating system you can actually use: draggable windows, a taskbar, a start
menu and a working terminal.

Live: _(add your deployment URL here)_

## How it works

Two renderers share one camera:

- **WebGL** draws the room — desk, CRT, keyboard, mouse, tower, lamp, mug, books.
  Every object is built procedurally from `BoxGeometry` / `ExtrudeGeometry` in
  code; there are no model files to download.
- **CSS3D** draws the screen. The operating system is real DOM, projected onto
  the glass by `CSS3DRenderer`.

The trick that joins them is a depth-only plane sitting exactly on the CRT
glass: it writes to the depth buffer but not to colour, so the room geometry
never paints over that region. The canvas is transparent there and the live DOM
shows through, while anything in front of the glass still occludes it correctly.

Window dragging divides pointer deltas by the screen's live scale factor
(`rect.width / 1280`), so windows track the cursor exactly however far away the
camera is.

## Editing the CV

**All content lives in [`src/data/cv.ts`](src/data/cv.ts).** Nothing else needs
to change. Edit the profile, links, education, skills, projects, experience and
achievements there and every window, the terminal and the printable résumé sheet
update together.

To swap the downloadable PDF, replace `public/Shrey_Jain_Resume.pdf` (keep the
filename, or update `resumePath` at the bottom of `cv.ts`).

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typechecks, then builds to dist/
npm run preview  # serve the production build
```

Requires Node 18+.

## Deploying

The build is a static `dist/` folder, so anything that serves static files works.

- **Vercel** — import the repo; `vercel.json` already sets the framework, build
  command and output directory.
- **Netlify** — build command `npm run build`, publish directory `dist`.
- **GitHub Pages** — run `npm run build` and publish `dist/`. `vite.config.ts`
  uses a relative `base`, so it works from a subpath without further config.

## Layout

```
src/
  data/cv.ts            every word the site displays
  experience/           Sizes, Time, Camera, Renderer, Experience (the frame loop)
  world/                layout constants, geometry helpers, Room, Desk,
                        Monitor (CRT + CSS3D screen), Peripherals, World
  os/                   OS shell, WindowManager, apps, Terminal, screen.css
  style.css             page chrome: loader, overlay UI, render-layer stacking
```

`src/world/layout.ts` holds the numbers the camera, the monitor and the CSS3D
screen all have to agree on — screen size, bezel depth, the idle camera pose.
Change those and everything else follows.

## Credits

Built from scratch with [three.js](https://threejs.org), TypeScript and Vite.
The idea of a portfolio you boot up is a well-worn genre — this one owes its
inspiration to Henry Heffernan's and Bruno Simon's 3D portfolios, but shares no
code or assets with either.

## Licence

[MIT](LICENSE) for the code. The CV content, résumé PDF and personal details are
Shrey Jain's own — please swap in your own if you reuse this.
