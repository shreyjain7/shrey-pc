# shrey-pc

Interactive 3D portfolio: a CRT computer you boot up to read a CV.
three.js + CSS3DRenderer, vanilla TypeScript, Vite. No framework.

## Working agreements

**"Push" means: commit, push the working branch, and fast-forward `main` — in
this repo (`shreyjain7/shrey-pc`), without asking which branch.** `main` is the
production branch Vercel deploys, so shipping is the point of the request. Don't
offer alternatives or ask for confirmation; just build, verify, and push both.

Never push to a different repository on a bare "push".

## Layout

```
src/
  main.ts               entry
  experience/           camera, loader, the page-level chrome
  world/                the studio, desk, machine, chair, telemetry bus
  os/                   the desktop environment
    OS.ts               shell: menu bar, dock, boot/shutdown, start menu
    WindowManager.ts    windows, dragging, resizing, snapping
    apps.ts             the app registry (id, title, icon, size, render)
    apps/               one file per app
    anim.ts             the motion engine (springs, ticker)
    fs.ts               virtual filesystem, persisted to localStorage
  data/                 cv.ts, timetable.ts, words.ts — all the content
```

## Things that will bite you

**The desktop is projected onto the monitor through a CSS3D transform.** Every
pixel that changes inside it re-rasters the whole 1280×960 surface and
re-composites it in 3D. So: no permanent `requestAnimationFrame` tickers inside
the OS, cap canvas redraws (the visualiser runs at 30Hz, the monitor graphs
sample every 0.16s), and prefer reconciling DOM over `replaceChildren`.

**`anim.ts`'s ticker delta is clamped to 1/20s** so a backgrounded tab cannot
fling the springs. That makes it unusable as a wall clock — anything measuring
real elapsed time must read `performance.now()` itself.

**The window layer's box is what WindowManager measures and clamps against.**
Do not inset `.windows` in CSS; windows end up placed off the surface. The menu
bar is accounted for by `TOP_MARGIN` in `WindowManager.ts` instead.

**Don't invent data.** Faculty names, credit counts, attendance figures and the
like are either sourced or absent — optional fields left unset. Plausible-looking
fabrication is worse than a visible gap, because nothing signals it is fake.

## Checks

```bash
npm run build     # tsc --noEmit && vite build — run before every push
npm run dev
```

There is no test suite and no CI; Vercel's deploy is the only remote check.
Verify UI changes in a real browser (Playwright + the pre-installed Chromium)
rather than assuming — most bugs this project has hit were only visible
on screen.
