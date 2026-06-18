// ── Lorenz attractor simulation + render, fully off main thread ──────────────

const sigma = 10.0;
const rho   = 28.0;
const beta  = 8.0 / 3.0;
const dt    = 0.0012;

const MAX_PARTICLES = 600;
const TRAIL_LENGTH  = 100;
const SIM_INTERVAL  = 32; // ms between sim steps (~30fps sim)
const FPS_CAP       = 33; // ms minimum between draw calls (~30fps render)

let ctx        = null;
let w          = 0;
let h          = 0;
let dpr        = 1;
let centerX    = 0;
let centerY    = 0;
let isMobile   = false;
let isVisible  = false;
let rafId      = null;
let lastTime   = 0;
let accumulator = 0;

// flat typed arrays for particle state — much faster than array of objects
const px  = new Float64Array(MAX_PARTICLES);
const py  = new Float64Array(MAX_PARTICLES);
const pz  = new Float64Array(MAX_PARTICLES);
// history stored as interleaved [x0,y0, x1,y1, ...] per particle
const histX = Array.from({ length: MAX_PARTICLES }, () => new Float32Array(TRAIL_LENGTH));
const histY = Array.from({ length: MAX_PARTICLES }, () => new Float32Array(TRAIL_LENGTH));
const histLen = new Int32Array(MAX_PARTICLES);  // current fill length
const histHead = new Int32Array(MAX_PARTICLES); // ring buffer write head

function initParticles() {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    let rx = Math.random() * 30 - 15;
    let ry = Math.random() * 30 - 15;
    let rz = Math.random() * 30 + 10;
    // warm up so particles start on the attractor
    for (let j = 0; j < 2500; j++) {
      const dx = sigma * (ry - rx) * dt;
      const dy = (rx * (rho - rz) - ry) * dt;
      const dz = (rx * ry - beta * rz) * dt;
      rx += dx; ry += dy; rz += dz;
    }
    px[i] = rx; py[i] = ry; pz[i] = rz;
    histLen[i]  = 0;
    histHead[i] = 0;
  }
}

function stepSim() {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const dx = sigma * (py[i] - px[i]) * dt;
    const dy = (px[i] * (rho - pz[i]) - py[i]) * dt;
    const dz = (px[i] * py[i] - beta * pz[i]) * dt;
    px[i] += dx; py[i] += dy; pz[i] += dz;

    const head = histHead[i];
    histX[i][head] = px[i];
    histY[i][head] = py[i];
    histHead[i] = (head + 1) % TRAIL_LENGTH;
    if (histLen[i] < TRAIL_LENGTH) histLen[i]++;
  }
}

function clearHistory() {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    histLen[i]  = 0;
    histHead[i] = 0;
  }
}

function draw(currentTime) {
  if (!ctx || !isVisible) return;

  // fps cap
  if (currentTime - lastTime < FPS_CAP) {
    rafId = requestAnimationFrame(draw);
    return;
  }
  const delta = Math.min(currentTime - lastTime, 100);
  lastTime = currentTime;

  // sim step
  accumulator += delta;
  if (accumulator >= SIM_INTERVAL) {
    stepSim();
    accumulator -= SIM_INTERVAL;
  }

  ctx.clearRect(0, 0, w, h);

  // build gradient
  let gradient;
  if (isMobile) {
    gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0,   'rgba(0,255,157,0.12)');
    gradient.addColorStop(0.5, 'rgba(0,255,157,0.18)');
    gradient.addColorStop(1,   'rgba(0,255,157,0.12)');
  } else {
    gradient = ctx.createLinearGradient(centerX - 250, 0, centerX + 350, 0);
    gradient.addColorStop(0,   'rgba(0,255,157,1)');
    gradient.addColorStop(0.4, 'rgba(0,255,157,0.45)');
    gradient.addColorStop(1,   'rgba(0,255,157,0.01)');
  }

  const zoomScale = 11.5;
  const jumpThreshold = w / 4;

  ctx.strokeStyle = gradient;
  ctx.lineWidth   = 0.85;
  ctx.beginPath();

  for (let i = 0; i < MAX_PARTICLES; i++) {
    const len  = histLen[i];
    if (len < 2) continue;

    const head = histHead[i]; // next write position = oldest entry when full
    const hx   = histX[i];
    const hy   = histY[i];

    // oldest index in the ring buffer
    const startIdx = len < TRAIL_LENGTH ? 0 : head;

    let prevSx = centerX + hx[startIdx] * zoomScale;
    let prevSy = centerY + hy[startIdx] * zoomScale;
    ctx.moveTo(prevSx, prevSy);

    for (let j = 1; j < len; j++) {
      const idx = (startIdx + j) % TRAIL_LENGTH;
      const sx  = centerX + hx[idx] * zoomScale;
      const sy  = centerY + hy[idx] * zoomScale;

      if (Math.abs(prevSx - sx) < jumpThreshold) {
        ctx.lineTo(sx, sy);
      } else {
        ctx.moveTo(sx, sy);
      }
      prevSx = sx;
      prevSy = sy;
    }
  }

  ctx.stroke();
  rafId = requestAnimationFrame(draw);
}

// ── message handler ──────────────────────────────────────────────────────────
self.onmessage = (e) => {
  const { type } = e.data;

  if (type === 'init') {
    const { canvas, width, height, devicePixelRatio, cx, cy, mobile } = e.data;
    ctx  = canvas.getContext('2d');
    dpr  = devicePixelRatio;
    w    = width;
    h    = height;
    centerX  = cx;
    centerY  = cy;
    isMobile = mobile;
    ctx.scale(dpr, dpr);
    initParticles();
  }

  if (type === 'resize') {
    const { width, height, devicePixelRatio, cx, cy, mobile } = e.data;
    dpr  = devicePixelRatio;
    w    = width;
    h    = height;
    centerX  = cx;
    centerY  = cy;
    isMobile = mobile;
    clearHistory();
  }

  if (type === 'center') {
    centerX  = e.data.cx;
    centerY  = e.data.cy;
    isMobile = e.data.mobile;
  }

  if (type === 'visible') {
    isVisible = e.data.value;
    if (isVisible) {
      lastTime    = performance.now();
      accumulator = 0;
      rafId = requestAnimationFrame(draw);
    } else {
      if (rafId !== null) cancelAnimationFrame(rafId);
    }
  }
};
