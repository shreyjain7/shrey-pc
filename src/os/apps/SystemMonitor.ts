import { telemetry } from '../../world/telemetry';
import { ticker } from '../anim';
import { mountCaseCam } from '../system';
import { el } from '../ui';

/**
 * System Monitor — the app that makes the hardware legible.
 *
 * The left half is a **live render of the actual tower**: the same scene the
 * room is drawn from, viewed through a second camera that slowly orbits the
 * case. Not a video, not a loop — open the terminal and run a `find`, and the
 * fans in this window spool up because the load in the graph beside them went
 * up.
 *
 * The right half is that load: four rolling graphs, the fan curve, core
 * temperatures, and a process table built from whatever the window manager
 * currently has open.
 */

const HISTORY = 120;
const RAM_TOTAL_MB = 65536;

interface Graph {
  label: string;
  unit: string;
  colour: string;
  /** Reads the current 0..1 value off the bus. */
  read: () => number;
  /** Formats the headline figure. */
  format: (value: number) => string;
  samples: Float32Array;
  cursor: number;
  canvas: HTMLCanvasElement;
  readout: HTMLElement;
}

/** Devicepixel-correct sizing, re-run whenever the window is resized. */
function fitCanvas(canvas: HTMLCanvasElement) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 260;
  const height = canvas.clientHeight || 64;
  const target = { w: Math.round(width * ratio), h: Math.round(height * ratio) };
  if (canvas.width !== target.w || canvas.height !== target.h) {
    canvas.width = target.w;
    canvas.height = target.h;
  }
  return ratio;
}

function drawGraph(graph: Graph) {
  const canvas = graph.canvas;
  const context = canvas.getContext('2d');
  if (!context) return;

  fitCanvas(canvas);
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);

  // Grid: four horizontal rules, so a spike has something to be measured off.
  context.strokeStyle = 'rgba(255,255,255,0.05)';
  context.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = Math.round((height / 4) * i) + 0.5;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const step = width / (HISTORY - 1);
  const pointAt = (index: number) => {
    // The ring buffer's oldest sample sits at the cursor.
    const sample = graph.samples[(graph.cursor + index) % HISTORY];
    return {
      x: index * step,
      y: height - Math.min(Math.max(sample, 0), 1) * (height - 2) - 1,
    };
  };

  // Filled area under the trace, then the trace itself on top.
  context.beginPath();
  context.moveTo(0, height);
  for (let i = 0; i < HISTORY; i += 1) {
    const point = pointAt(i);
    context.lineTo(point.x, point.y);
  }
  context.lineTo(width, height);
  context.closePath();

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, graph.colour + '55');
  gradient.addColorStop(1, graph.colour + '00');
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  for (let i = 0; i < HISTORY; i += 1) {
    const point = pointAt(i);
    if (i === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.strokeStyle = graph.colour;
  context.lineWidth = Math.max(1.5, (window.devicePixelRatio || 1) * 0.9);
  context.lineJoin = 'round';
  context.stroke();
}

export function createSystemMonitor(): HTMLElement {
  const root = el('div', 'sysmon');

  /* --- Case cam --------------------------------------------------------- */

  const stage = el('section', 'sysmon__stage');
  const stageHead = el('div', 'sysmon__stage-head');
  stageHead.append(el('span', 'sysmon__stage-title', 'Case cam'));
  const liveDot = el('span', 'sysmon__live', 'LIVE');
  stageHead.append(liveDot);
  stage.append(stageHead);

  const canvas = el('canvas', 'sysmon__canvas');
  stage.append(canvas);

  const legend = el('div', 'sysmon__legend');
  const rpmReadout = el('span', 'sysmon__rpm', '0 RPM');
  legend.append(rpmReadout);
  legend.append(el('span', 'sysmon__hint', 'Live from the room · the fans follow real load'));
  stage.append(legend);

  const unmountCam = mountCaseCam(canvas);

  /* --- Graphs ----------------------------------------------------------- */

  const panel = el('section', 'sysmon__panel');

  const specs: Array<Omit<Graph, 'samples' | 'cursor' | 'canvas' | 'readout'>> = [
    {
      label: 'CPU',
      unit: '%',
      colour: '#5fd0ff',
      read: () => telemetry.state.cpu,
      format: (value) => (value * 100).toFixed(0) + '%',
    },
    {
      label: 'GPU',
      unit: '%',
      colour: '#b18cff',
      read: () => telemetry.state.gpu,
      format: (value) => (value * 100).toFixed(0) + '%',
    },
    {
      label: 'Memory',
      unit: 'GB',
      colour: '#6ee7a8',
      read: () => telemetry.state.ram,
      format: (value) => ((value * RAM_TOTAL_MB) / 1024).toFixed(1) + ' / 64 GB',
    },
    {
      label: 'Frame rate',
      unit: 'fps',
      colour: '#ffb454',
      // Normalised against 120fps so a high-refresh display has headroom.
      read: () => Math.min(telemetry.state.fps / 120, 1),
      format: () => telemetry.state.fps + ' fps',
    },
  ];

  const graphs: Graph[] = specs.map((spec) => {
    const block = el('div', 'sysmon__graph');

    const head = el('div', 'sysmon__graph-head');
    head.append(el('span', 'sysmon__graph-label', spec.label));
    const readout = el('span', 'sysmon__graph-value', '—');
    readout.style.color = spec.colour;
    head.append(readout);
    block.append(head);

    const graphCanvas = el('canvas', 'sysmon__graph-canvas');
    block.append(graphCanvas);
    panel.append(block);

    return {
      ...spec,
      samples: new Float32Array(HISTORY),
      cursor: 0,
      canvas: graphCanvas,
      readout,
    };
  });

  /* --- Hardware readouts ------------------------------------------------ */

  const specsGrid = el('div', 'sysmon__specs');
  const tempCpu = el('span', 'sysmon__spec-value', '—');
  const tempGpu = el('span', 'sysmon__spec-value', '—');
  const fanValue = el('span', 'sysmon__spec-value', '—');
  const diskValue = el('span', 'sysmon__spec-value', '—');

  for (const [label, node] of [
    ['CPU temp', tempCpu],
    ['GPU temp', tempGpu],
    ['Fans', fanValue],
    ['Disk', diskValue],
  ] as Array<[string, HTMLElement]>) {
    const cell = el('div', 'sysmon__spec');
    cell.append(el('span', 'sysmon__spec-label', label));
    cell.append(node);
    specsGrid.append(cell);
  }
  panel.append(specsGrid);

  /* --- Processes -------------------------------------------------------- */

  panel.append(el('h3', 'sysmon__heading', 'Processes'));
  const processes = el('div', 'sysmon__processes');
  panel.append(processes);

  root.append(stage, panel);

  /* --- Loop ------------------------------------------------------------- */

  let sinceGraph = 0;
  let sinceProcess = 0;

  const stop = ticker((delta) => {
    const state = telemetry.state;

    // Sample on a fixed clock rather than per frame: a graph that samples per
    // frame reads as noise on a 144Hz panel and as a different shape on a
    // 30Hz one — and each redraw re-rasters the whole projected screen.
    sinceGraph += delta;
    if (sinceGraph >= 0.16) {
      sinceGraph = 0;
      for (const graph of graphs) {
        graph.samples[graph.cursor] = graph.read();
        graph.cursor = (graph.cursor + 1) % HISTORY;
        graph.readout.textContent = graph.format(graph.read());
        drawGraph(graph);
      }

      tempCpu.textContent = state.tempCpu.toFixed(0) + ' °C';
      tempGpu.textContent = state.tempGpu.toFixed(0) + ' °C';
      fanValue.textContent = Math.round(state.rpm) + ' RPM';
      rpmReadout.textContent = Math.round(state.rpm) + ' RPM';
      diskValue.textContent = state.disk > 0.05 ? 'Active' : 'Idle';
      diskValue.classList.toggle('is-hot', state.disk > 0.05);
      liveDot.classList.toggle('is-busy', state.cpu > 0.35);
    }

    sinceProcess += delta;
    if (sinceProcess >= 1) {
      sinceProcess = 0;
      renderProcesses();
    }

    return true;
  });

  /** How much of a notional half-megabyte disk the virtual filesystem uses. */
  function diskShare() {
    try {
      return Math.min((localStorage.getItem('shrey-pc:fs:v1') ?? '').length / (512 * 1024), 1);
    } catch {
      return 0.02;
    }
  }

  function renderProcesses() {
    processes.replaceChildren();

    // The window manager is the source of truth for what is running; the OS
    // stamps the open app ids onto the screen root as it changes.
    const running = (document.querySelector('.screen')?.getAttribute('data-running') ?? '')
      .split(',')
      .filter(Boolean);

    const rows: Array<[string, number, string]> = [
      ['shrey-os', 0.04, 'System'],
      ['compositor', 0.03, 'System'],
      ['fs-daemon', diskShare(), 'System'],
      ...running.map((id) => [id, 0.02 + Math.random() * 0.06, 'User'] as [string, number, string]),
    ];

    for (const [name, share, kind] of rows) {
      const row = el('div', 'sysmon__process');
      row.append(el('span', 'sysmon__process-name', name));
      row.append(el('span', 'sysmon__process-kind', kind));

      const barWrap = el('span', 'sysmon__process-bar');
      const bar = el('span', 'sysmon__process-fill');
      bar.style.width = Math.min(share * 100, 100).toFixed(1) + '%';
      barWrap.append(bar);
      row.append(barWrap);

      row.append(el('span', 'sysmon__process-share', (share * 100).toFixed(1) + '%'));
      processes.append(row);
    }
  }

  renderProcesses();

  // Rendering a second view of the scene is genuine GPU work; say so on the
  // bus so the fans in the window react to the window being open.
  telemetry.setGpuLoad(0.42);
  telemetry.process(0.5);

  const observer = new ResizeObserver(() => {
    for (const graph of graphs) drawGraph(graph);
  });
  observer.observe(panel);

  root.addEventListener('app:destroy', () => {
    stop();
    observer.disconnect();
    unmountCam();
    telemetry.setGpuLoad(0);
  });

  return root;
}
