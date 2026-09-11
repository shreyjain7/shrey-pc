# shrey-pc

An interactive 3D portfolio for **Shrey Jain** — a workstation sitting on a desk
in a dark room. Wait for the resource counter, press START, then click the
monitor: the camera flies in, the machine runs a POST, and the CV turns out to be
a small operating system you can actually use.

It is not just the screen. The **tower beside it is a real machine**: a
glass-panelled case whose fans spin at a speed derived from the load the OS is
genuinely under, whose drive LED blinks when the virtual filesystem is written
to, and whose RGB cycles faster the harder it works. Type in the terminal and a
keycap lights up out on the desk. Move the cursor and the mouse slides across
the mousepad. Play something and the speaker cones move.

Live: _(add your deployment URL here)_

## What's in it

- **A room, not a page.** Desk, CRT, keyboard, mouse, a glass-panel tower,
  lamp, speakers, headphones, mug, pen cup, sticky notes, cabling, a shelf with
  books and a plant, framed prints, a shuttered window onto a night skyline, a
  rug, and dust drifting through the lamp light.
- **A machine you can watch work.** See [The hardware](#the-hardware) below.
- **A real OS on the glass** — not a set of static panels. See [shrey-os](#shrey-os).
- **Three camera views**: the room, the *workstation* (the machine and the
  desktop side by side), and square on the glass. Cycle them with the taskbar
  button, the corner control, or the `V` key.
- **A BIOS boot** with a memory count that ticks up in place, drive detection,
  and a CRT "snap" into the desktop.
- **Sound**, synthesised at runtime — mains hum and flyback whine from the tube,
  keycaps bottoming out as you type, a degauss thunk at power-on, a startup
  chime, and a generative soundtrack in the music player. Mutable, and the
  preference sticks.
- **Free look.** Drag or use the arrow keys to orbit the desk; a reset button
  swings you back.
- **Corner controls**: camera view, sound, reset view, fullscreen.

## The hardware

The tower is built the same way as everything else here — procedurally, from
boxes, extruded slabs and instanced blade clusters — but it is wired to what the
operating system is actually doing.

`src/world/telemetry.ts` is the only place the two halves meet. The OS pushes
signals in (a keystroke, a disk write, an app launching, the music player's
output level, where the cursor is); the bus smooths them into load, memory,
temperature and a fan curve; and the room reads that back every frame. Nothing
is on a timed loop.

- **Six fans** — three front intakes, a CPU cooler, two on the GPU and a rear
  exhaust — spinning on a curve that chases *temperature*, not load, so there
  is the same half-second lag a real machine has.
- **A tempered side panel** over a motherboard, a tower cooler with heat pipes,
  a graphics card with a lit logo bar, two RGB memory sticks, a PSU shroud and
  a drive cage.
- **Lighting that means something**: the cooler block runs blue when cold and
  slides to red as the core heats, the RGB cycle speeds up under load, the
  drive LED flickers on every write to the virtual filesystem.
- **The desk reacts too.** A keystroke anywhere in the OS lights a keycap and
  leaves it fading; the mouse tracks the OS cursor across the mousepad with a
  little lag and leans into the direction of travel; the speaker cones ride the
  music player's output.

Two places to watch it from:

- **Workstation view** pulls the camera back so the tower, the keyboard and the
  CRT are all in frame, and lifts the OS off the glass into a panel docked to
  the right — so the desktop stays usable *while* the machine running it is on
  screen.
- **System Monitor**, an app, renders the tower into a window using a second
  renderer over the *same scene*. It is not a video: it is the same fans at the
  same angle, spun by the same numbers as the graphs beside them.

## shrey-os

The screen runs a small desktop environment on top of a **virtual filesystem**
that persists to `localStorage`. Everything is connected: a file created in the
terminal appears on the desktop, a file renamed on the desktop is visible to
`ls`, and a document saved in the editor can be `cat`-ed back.

- **Filesystem** — real paths under `/home/shrey`, with directories, text files,
  app launchers and links. The CV is seeded onto the disk as readable files, so
  `cat ~/Documents/projects.txt` works. System files are write-protected and
  re-seeded from `src/data/cv.ts` on every boot; anything you create is yours
  and survives a reload.
- **Shell** — a genuine interpreter over that filesystem: `ls`, `cd`, `pwd`,
  `cat`, `mkdir`, `touch`, `rm`, `mv`, `cp`, `echo >` / `>>`, `tree`, `find`,
  `grep`, `open`, `edit`, `df`, `history`, `neofetch`, `uname`, `whoami`,
  `sudo`, `clear`, plus `next`, `today` and `attendance` over the timetable.
  Tab completion over both commands and filenames, plus command history on the
  arrow keys.
- **Files** — a file manager with back/forward/up history, breadcrumbs,
  selection, new folder and file, rename (F2), delete (Del) and context menus.
- **Notepad** — opens any text file, edits it, saves with Ctrl+S or Save as,
  tracks a dirty marker and a live line/word/character count. System files open
  read-only.
- **Paint** — a raster editor with a palette, brush sizes and an eraser; saves a
  PNG into `~/Pictures`, and reopens it later.
- **Aperture**, a browser — tabs with their own history, an address bar that
  resolves what you type, bookmarks, a progress bar, and a small local web:
  a start page, the CV as proper pages, the timetable, and a **live GitHub
  profile** pulled from the public API for
  [github.com/shreyjain7](https://github.com/shreyjain7) (with a bundled
  snapshot when the network says no). Typing anything that is not an address
  searches the machine. External addresses get an honest hand-off card rather
  than a blank frame, because sites refuse to be embedded.
- **Timetable & Attendance** — the week as a colour-coded grid, today as a
  timeline that knows which period you are actually in, and the attendance
  ledger with the only number that matters: how many more classes you can miss
  before you drop under the institute's minimum. Marking yourself present
  persists.
- **System Monitor** — the live case cam, four rolling graphs, temperatures,
  the fan curve, and a process table built from what is actually open.
- **Player** — a library of nine generative tracks across three albums, laid out
  like a streaming client: playlist sidebar, cover art, a track table and a
  now-playing bar with transport, scrubber and spectrum analyser. Every track is
  synthesised live from a chord progression and a step sequencer, and the output
  level drives the speakers in the room. No audio files ship. A Spotify pane
  sits alongside it for real music — Karan Aujla by default — through Spotify's
  official embed, which is the licensed way to play a catalogue that is not
  mine to distribute. The field under the player takes any Spotify link.
- **Showcase** — the whole CV behind one vertical nav: About, Experience,
  Projects, Skills, Education, Awards, Résumé and Contact, with the résumé PDF
  a click away. This replaced the eight separate CV windows it used to take.
- **Search** — the web, in-window. Google cannot be embedded (it sends
  `X-Frame-Options` and a CSP `frame-ancestors` that make browsers refuse to
  render it inside another page), so this queries Wikipedia's API — which does
  allow cross-origin reads — alongside DuckDuckGo's Instant Answer endpoint,
  and lays the results out here. Opening a result renders the article as a
  reader in the same window, so nothing ever leaves the OS.
- **Wire**, a news reader — the Hacker News front page through the public
  Algolia endpoint, laid out as a reader rather than a list of links.
- **Minesweeper** — three difficulties, flags, chording, a timer, and a first
  click that is always safe.
- **Wordle** — six guesses, proper duplicate-letter scoring (exact matches claim
  their letter before anything comes back yellow), a keyboard that tracks what
  you know, and a record that persists.
- **DOS** — a real DOSBox via js-dos, loaded from a CDN on first open. It ships
  without games: DOS game data is copyrighted, so it takes a `.jsdos` bundle you
  point it at, from disk or a URL.
- **Credits** — what the thing is made of, and where the idea came from.
- **Calculator** — four functions, percent and sign, mouse or keyboard.
- **Settings** — five wallpapers and five accent colours applied live as CSS
  custom properties, toggles for scanlines, flicker, key clicks and a 24-hour
  clock, storage usage, and buttons to reset the disk or your preferences.
  Everything persists.
- **The shell around it** — a macOS-shaped desktop: a translucent menu bar that
  names whichever app has focus, a dock whose icons swell toward the cursor,
  traffic-light window controls and centred titles. Windows are draggable *and*
  resizable (eight grips), with minimise / maximise / close, snapping
  (Alt+←/→/↑), Alt+Tab and Ctrl+W. Plus a clock that opens a calendar, a menu
  with search across apps and files, right-click context menus on the desktop
  and on every icon, in-CRT dialogs, toast notifications, and a shutdown
  sequence that halts the machine back to standby — where any key boots it again.

All of the CV lives in Showcase now. The renderers behind each section sit in
`src/os/apps/cv.ts`, so the sections stay independent of the window that happens
to be showing them.

## Motion

Everything that moves in the OS runs off one engine (`src/os/anim.ts`): a single
`requestAnimationFrame` ticker, and springs integrated at a fixed 1/240s substep
so the motion is identical on a 60Hz panel and a 144Hz one.

Springs rather than CSS transitions, because a spring can be re-targeted
mid-flight without the jump you get from restarting a transition — a window can
be dragged while it is still settling from being opened. Windows compose four
independent springs (scale, x, y, tilt) plus pointer parallax into a single
transform write per frame. Minimising *genies* toward the app's own taskbar
button; maximising and snapping set the new geometry first and then play the
difference back, so the content has already reflowed while the frame is still
moving.

One rule shapes the rest of it: the desktop is projected onto the glass through
a 3D transform, so **every pixel that changes forces the whole 1280×960 surface
to re-raster**. So the cursor halo is driven by its own springs and goes silent
when the pointer stops, window parallax retires itself once it has caught up,
the monitor's graphs sample on a fixed clock, and the music visualiser draws
every bar into one path and fills it once, at 30Hz. `prefers-reduced-motion`
cuts the whole thing down in one place.

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

## Editing the timetable

**The timetable lives in [`src/data/timetable.ts`](src/data/timetable.ts)** —
subjects, the period times, the day-by-day grid, and the seed attendance
counts. The app, the browser's timetable page, the `next` / `today` /
`attendance` shell commands and `~/Documents/timetable.txt` all read from it, so
they update together.

The grid is transcribed from the timetable published on
[shreyjain.in](https://shreyjain.in) — VII semester CSE at the School of
Computer Engineering, MIT Manipal — along with its room numbers and the IA
windows. Faculty names and credit counts are deliberately absent: the source
does not carry them, and both fields are optional rather than filled with
plausible-looking guesses.

Attendance starts at zero and is not seeded. Marking yourself present or absent
in the app writes to `localStorage` over the top, so it survives a reload
without touching the file; until something is logged, the app and the
`attendance` command both say so rather than reporting a meaningless 100%.

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
  data/timetable.ts     the week, the subjects and the attendance ledger
  experience/           Sizes (device tiers), Time, Camera (three poses),
                        Audio (synthesised), Renderer, Experience (frame loop
                        and the case-cam renderer)
  world/                layout constants, geometry and texture helpers, Room,
                        Desk, Monitor (CRT + CSS3D screen), Tower (the machine),
                        Peripherals (reactive desk), Dust, telemetry.ts (the
                        wire between the OS and the hardware), World
  os/                   fs.ts (virtual filesystem), settings.ts, system.ts,
                        anim.ts (the motion engine), github.ts (live API),
                        OS shell, WindowManager, Terminal (the shell),
                        ContextMenu, Notifications, ui helpers,
                        apps/ (Browser, Timetable, SystemMonitor, Music, News,
                        Explorer, Notepad, Paint, Minesweeper, Wordle, Dos,
                        Search,
                        Calculator, Settings, Showcase, Credits, cv.ts —
                        the shared CV renderers),
                        screen.css + desktop.css + apps.css
  style.css             page chrome: loader, overlay UI, workstation dock
```

`src/world/layout.ts` holds the numbers the camera, the monitor, the tower and
the CSS3D screen all have to agree on — screen size, bezel depth, where the case
stands, and the idle and workstation camera poses. Change those and everything
else follows.

## Network

Two things reach the internet, and both fail softly:

- the **GitHub page** calls `api.github.com` for the profile and repositories
  (no key; cached in `sessionStorage` for half an hour to stay inside the
  unauthenticated rate limit), and
- **Wire** calls the Hacker News Algolia endpoint (no key).

Blocked, offline or rate-limited, each falls back to a small bundled set and
says so in the interface rather than showing an error or an empty page.

## Credits

Built from scratch with [three.js](https://threejs.org), TypeScript and Vite.
The idea of a portfolio you boot up is a well-worn genre — this one owes its
inspiration to Henry Heffernan's and Bruno Simon's 3D portfolios, but shares no
code or assets with either.

## Licence

[MIT](LICENSE) for the code. The CV content, résumé PDF and personal details are
Shrey Jain's own — please swap in your own if you reuse this.
