# shrey-pc

An interactive 3D portfolio for **Shrey Jain** — a CRT computer sitting on a desk
in a dark room. Wait for the resource counter, press START, then click the
monitor: the camera flies in, the machine runs a POST, and the CV turns out to be
a small operating system you can actually use.

Live: _(add your deployment URL here)_

## What's in it

- **A room, not a page.** Desk, CRT, keyboard, mouse, tower, lamp, speakers,
  headphones, mug, pen cup, sticky notes, cabling, a shelf with books and a
  plant, framed prints, a shuttered window onto a night skyline, a rug, and dust
  drifting through the lamp light.
- **A real OS on the glass.** Draggable, minimisable, maximisable windows; a
  taskbar with a live clock; a start menu; a printable résumé sheet; and a
  working terminal (`help`, `whoami`, `neofetch`, `open resume`, `sudo`…).
- **A BIOS boot** with a memory count that ticks up in place, drive detection,
  and a CRT "snap" into the desktop.
- **Sound**, synthesised at runtime — mains hum and flyback whine from the tube,
  keycaps bottoming out as you type, a degauss thunk at power-on, a startup
  chime. Mutable, and the preference sticks.
- **Free look.** Drag or use the arrow keys to orbit the desk; a reset button
  swings you back.
- **Corner controls**: sound, reset view, fullscreen.

## Built for phones, not just shrunk

A 1280×960 screen projected onto a small piece of glass is unreadable, so on a
compact viewport the OS **leaves the 3D layer entirely**. The moment the camera
settles, the operating system is re-parented out of the CSS3D scene into a
fullscreen overlay and laid out at **true 1:1 pixels** — full-bleed windows, a
one-window-at-a-time taskbar, larger tap targets, and text at its natural size.
Stepping back to the room puts it on the glass again.

Alongside that:

- A device tier (`low` / `medium` / `high`) derived from pointer type, core count
  and device memory drives pixel-ratio caps, shadow resolution and filtering,
  antialiasing, dust count, and which props are built at all.
- Sizing follows `visualViewport`, so iOS Safari's collapsing address bar never
  leaves a stale canvas.
- Safe-area insets are respected; page scroll, rubber-banding and double-tap zoom
  are disabled.
- A wider lens in portrait, and a landscape-phone layout that drops the chrome
  there is no room for.

## How the two layers join

Two renderers share one camera:

- **WebGL** draws the room. Every object is built procedurally from
  `BoxGeometry` / `ExtrudeGeometry` / `TubeGeometry`, and every texture is drawn
  to a canvas at load time — no model or image files are ever fetched.
- **CSS3D** draws the screen: the OS is real DOM, projected onto the glass by
  `CSS3DRenderer`.

The trick that joins them is a depth-only plane sitting exactly on the CRT
glass. It writes to the depth buffer but not to colour, so the room geometry
never paints over that region: the canvas stays transparent there and the live
DOM shows through, while anything in front of the glass still occludes it.

Window dragging divides pointer deltas by the screen's live scale factor, and
window layout measures the screen element's own box rather than a constant — so
the same code lays out correctly whether it is scaled onto glass or running 1:1
in the phone overlay.

## Editing the CV

**All content lives in [`src/data/cv.ts`](src/data/cv.ts).** Nothing else needs
to change. Edit the profile, links, education, skills, projects, experience and
achievements there and every window, the terminal and the printable résumé sheet
update together.

To swap the downloadable PDF, replace `public/Shrey_Jain_Resume.pdf` (keep the
filename, or update `resumePath` at the bottom of `cv.ts`).

## Analytics

Google Analytics is wired up but **switched off until you give it an ID**. Copy
`.env.example` to `.env` and set yours:

```
VITE_GA_ID=G-XXXXXXXXXX
```

With no ID the gtag script is never fetched, so development and any fork stay
free of third-party requests. An explicit Do Not Track signal is honoured. On
Vercel or Netlify, set the same variable in the dashboard.

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
  analytics.ts          opt-in GA4, no-op without VITE_GA_ID
  experience/           Sizes (device tiers), Time, Camera (orbit + dolly),
                        Audio (synthesised), Renderer, Experience (frame loop)
  world/                layout constants, geometry and texture helpers, Room,
                        Desk, Monitor (CRT + CSS3D screen), Peripherals, Dust,
                        World (staged build)
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
