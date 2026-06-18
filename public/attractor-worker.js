const sigma = 10.0;
const rho   = 28.0;
const beta  = 8.0 / 3.0;
const dt    = 0.0012;

const MAX_PARTICLES = 600;
const TRAIL_LENGTH  = 100;
const FPS_CAP       = 33; // ~30fps render cap

let ctx            = null;
let w              = 0;
let h              = 0;
let dpr            = 1;
let centerX        = 0;
let centerY        = 0;
let isMobile       = false;
let isVisible      = false;
let rafId          = null;
let lastFrameTime  = 0;
let simIntervalId  = null;
let cachedGradient = null;

const px     = new Float64Array(MAX_PARTICLES);
const py     = new Float64Array(MAX_PARTICLES);
const pz     = new Float64Array(MAX_PARTICLES);
const histX  = Array.from({ length: MAX_PARTICLES }, () => new Float32Array(TRAIL_LENGTH));
const histY  = Array.from({ length: MAX_PARTICLES }, () => new Float32Array(TRAIL_LENGTH));
const histLen  = new Int32Array(MAX_PARTICLES);
const histHead = new Int32Array(MAX_PARTICLES);

const screenX = new Float32Array(MAX_PARTICLES * TRAIL_LENGTH);
const screenY = new Float32Array(MAX_PARTICLES * TRAIL_LENGTH);

function initParticles() {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    let rx = Math.random() * 30 - 15;
    let ry = Math.random() * 30 - 15;
    let rz = Math.random() * 30 + 10;
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

function buildGradient() {
  if (!ctx) return;
  if (isMobile) {
    cachedGradient = ctx.createLinearGradient(0, 0, w / dpr, 0);
    cachedGradient.addColorStop(0,   'rgba(0,255,157,0.12)');
    cachedGradient.addColorStop(0.5, 'rgba(0,255,157,0.18)');
    cachedGradient.addColorStop(1,   'rgba(0,255,157,0.12)');
  } else {
    cachedGradient = ctx.createLinearGradient(centerX - 250, 0, centerX + 350, 0);
    cachedGradient.addColorStop(0,   'rgba(0,255,157,1)');
    cachedGradient.addColorStop(0.4, 'rgba(0,255,157,0.45)');
    cachedGradient.addColorStop(1,   'rgba(0,255,157,0.01)');
  }
}

function startSim() {
  if (simIntervalId !== null) return;
  simIntervalId = setInterval(stepSim, 32);
}

function stopSim() {
  if (simIntervalId !== null) {
    clearInterval(simIntervalId);
    simIntervalId = null;
  }
}

function draw(now) {
  rafId = requestAnimationFrame(draw);
  if (!ctx || !isVisible) return;

  if (now - lastFrameTime < FPS_CAP) return;
  lastFrameTime = now;

  const cssW = w / dpr;
  const cssH = h / dpr;
  ctx.clearRect(0, 0, cssW, cssH);

  if (!cachedGradient) buildGradient();

  const zoomScale      = 11.5;
  const jumpThreshold  = cssW / 4;

  ctx.strokeStyle = cachedGradient;
  ctx.lineWidth   = 0.85;
  ctx.beginPath();

  for (let i = 0; i < MAX_PARTICLES; i++) {
    const len = histLen[i];
    if (len < 2) continue;

    const head     = histHead[i];
    const hx       = histX[i];
    const hy       = histY[i];
    const startIdx = len < TRAIL_LENGTH ? 0 : head;

    for (let j = 0; j < len; j++) {
      const idx    = (startIdx + j) % TRAIL_LENGTH;
      screenX[j]   = centerX + hx[idx] * zoomScale;
      screenY[j]   = centerY + hy[idx] * zoomScale;
    }

    ctx.moveTo(screenX[0], screenY[0]);
    for (let j = 1; j < len; j++) {
      if (Math.abs(screenX[j - 1] - screenX[j]) < jumpThreshold) {
        ctx.lineTo(screenX[j], screenY[j]);
      } else {
        ctx.moveTo(screenX[j], screenY[j]);
      }
    }
  }

  ctx.stroke();
}

self.onmessage = (e) => {
  const { type } = e.data;

  if (type === 'init') {
    const { canvas, width, height, devicePixelRatio, cx, cy, mobile } = e.data;
    ctx      = canvas.getContext('2d');
    dpr      = Math.min(devicePixelRatio, 1.5); // cap DPR at 1.5
    w        = width;
    h        = height;
    centerX  = cx;
    centerY  = cy;
    isMobile = mobile;
    ctx.scale(dpr, dpr);
    initParticles();
    buildGradient();
    rafId = requestAnimationFrame(draw);
  }

  if (type === 'resize') {
    const { width, height, devicePixelRatio, cx, cy, mobile } = e.data;
    dpr      = Math.min(devicePixelRatio, 1.5);
    w        = width;
    h        = height;
    centerX  = cx;
    centerY  = cy;
    isMobile = mobile;
    clearHistory();
    buildGradient();
  }

  if (type === 'center') {
    centerX  = e.data.cx;
    centerY  = e.data.cy;
    isMobile = e.data.mobile;
    buildGradient();
  }

  if (type === 'visible') {
    isVisible = e.data.value;
    if (isVisible) {
      lastFrameTime = performance.now();
      startSim();
      if (rafId === null) rafId = requestAnimationFrame(draw);
    } else {
      stopSim();
    }
  }
};