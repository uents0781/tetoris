const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.querySelector('#next');
const nextCtx = nextCanvas.getContext('2d');
const overlay = document.querySelector('#overlay');
const overlayKicker = document.querySelector('#overlay-kicker');
const overlayTitle = document.querySelector('#overlay-title');
const startButton = document.querySelector('#start-button');
const scoreEl = document.querySelector('#score');
const linesEl = document.querySelector('#lines');
const levelEl = document.querySelector('#level');
const speedEl = document.querySelector('#speed');
const speedBar = document.querySelector('#speed-bar');
const soundButton = document.querySelector('#sound-button');

const COLORS = {
  I: '#38e8ff', J: '#6f70ff', L: '#ff9b37', O: '#ffe34b',
  S: '#78ee5b', T: '#bf63ff', Z: '#ff4f78'
};

const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
  O: [[1,1],[1,1]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]]
};

let board = createBoard();
let piece = null;
let bag = [];
let nextPiece = randomPiece();
let score = 0;
let lines = 0;
let level = 1;
let running = false;
let paused = false;
let soundOn = true;
let lastTime = 0;
let dropCounter = 0;
let animationId = null;
let audioContext = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece() {
  if (!bag.length) bag = Object.keys(SHAPES).sort(() => Math.random() - 0.5);
  const type = bag.pop();
  return { type, matrix: SHAPES[type].map(row => [...row]), x: 0, y: 0 };
}

function spawnPiece() {
  piece = nextPiece;
  nextPiece = randomPiece();
  piece.x = Math.floor((COLS - piece.matrix[0].length) / 2);
  piece.y = piece.type === 'I' ? -1 : 0;
  drawNext();
  if (collides(piece)) endGame();
}

function collides(candidate) {
  return candidate.matrix.some((row, y) => row.some((value, x) => {
    if (!value) return false;
    const boardX = candidate.x + x;
    const boardY = candidate.y + y;
    return boardX < 0 || boardX >= COLS || boardY >= ROWS || (boardY >= 0 && board[boardY][boardX]);
  }));
}

function merge() {
  piece.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value && piece.y + y >= 0) board[piece.y + y][piece.x + x] = piece.type;
  }));
}

function move(dx, dy) {
  if (!running || paused) return false;
  const candidate = { ...piece, x: piece.x + dx, y: piece.y + dy };
  if (!collides(candidate)) {
    piece = candidate;
    if (dy) dropCounter = 0;
    draw();
    return true;
  }
  if (dy > 0) lockPiece();
  return false;
}

function rotate() {
  if (!running || paused) return;
  const matrix = piece.matrix[0].map((_, i) => piece.matrix.map(row => row[i]).reverse());
  for (const offset of [0, -1, 1, -2, 2]) {
    const candidate = { ...piece, matrix, x: piece.x + offset };
    if (!collides(candidate)) {
      piece = candidate;
      beep(360, .035);
      draw();
      return;
    }
  }
}

function hardDrop() {
  if (!running || paused) return;
  let distance = 0;
  while (!collides({ ...piece, y: piece.y + 1 })) {
    piece.y++;
    distance++;
  }
  score += distance * 2;
  updateStats();
  beep(110, .06);
  lockPiece();
  draw();
}

function lockPiece() {
  merge();
  clearLines();
  spawnPiece();
  beep(160, .025);
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      y++;
    }
  }
  if (cleared) {
    score += [0, 100, 300, 500, 800][cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    updateStats();
    beep(cleared === 4 ? 880 : 620, .12);
  }
}

function getGhostY() {
  let y = piece.y;
  while (!collides({ ...piece, y: y + 1 })) y++;
  return y;
}

function drawCell(context, x, y, color, size = BLOCK, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,.27)';
  context.fillRect(x * size + 3, y * size + 3, size - 6, 2);
  context.fillStyle = 'rgba(0,0,0,.22)';
  context.fillRect(x * size + 3, (y + 1) * size - 5, size - 6, 2);
  context.restore();
}

function draw() {
  ctx.fillStyle = '#0c0c13';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,.035)';
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * BLOCK, 0); ctx.lineTo(x * BLOCK, canvas.height); ctx.stroke(); }
  for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * BLOCK); ctx.lineTo(canvas.width, y * BLOCK); ctx.stroke(); }
  board.forEach((row, y) => row.forEach((type, x) => type && drawCell(ctx, x, y, COLORS[type])));
  if (piece && running) {
    const ghostY = getGhostY();
    piece.matrix.forEach((row, y) => row.forEach((value, x) => {
      if (!value) return;
      if (ghostY + y >= 0) drawCell(ctx, piece.x + x, ghostY + y, COLORS[piece.type], BLOCK, .16);
      if (piece.y + y >= 0) drawCell(ctx, piece.x + x, piece.y + y, COLORS[piece.type]);
    }));
  }
}

function drawNext() {
  nextCtx.clearRect(0, 0, 120, 120);
  const size = 24;
  const matrix = nextPiece.matrix;
  const offsetX = (5 - matrix[0].length) / 2;
  const offsetY = (5 - matrix.length) / 2;
  matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) drawCell(nextCtx, x + offsetX, y + offsetY, COLORS[nextPiece.type], size);
  }));
}

function updateStats() {
  scoreEl.textContent = String(score).padStart(6, '0');
  linesEl.textContent = String(lines).padStart(2, '0');
  levelEl.textContent = String(level).padStart(2, '0');
  speedEl.textContent = `${(1 + (level - 1) * .18).toFixed(1)}×`;
  speedBar.style.width = `${Math.min(100, level * 10)}%`;
}

function dropInterval() { return Math.max(90, 850 - (level - 1) * 70); }

function gameLoop(time = 0) {
  if (!running) return;
  const delta = time - lastTime;
  lastTime = time;
  if (!paused) {
    dropCounter += delta;
    if (dropCounter > dropInterval()) move(0, 1);
    draw();
  }
  animationId = requestAnimationFrame(gameLoop);
}

function startGame() {
  cancelAnimationFrame(animationId);
  board = createBoard();
  score = 0; lines = 0; level = 1;
  running = true; paused = false;
  dropCounter = 0; lastTime = performance.now();
  nextPiece = randomPiece();
  spawnPiece();
  updateStats();
  overlay.classList.add('hidden');
  gameLoop(lastTime);
}

function endGame() {
  running = false;
  cancelAnimationFrame(animationId);
  overlayKicker.textContent = `SCORE ${String(score).padStart(6, '0')}`;
  overlayTitle.textContent = 'GAME OVER';
  startButton.innerHTML = 'PLAY AGAIN <span>↗</span>';
  overlay.classList.remove('hidden');
  beep(85, .3);
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  overlayKicker.textContent = 'GAME PAUSED';
  overlayTitle.textContent = 'TAKE A BREATH';
  startButton.innerHTML = 'RESUME <span>↗</span>';
  overlay.classList.toggle('hidden', !paused);
}

function beep(frequency, duration) {
  if (!soundOn) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'square'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.025, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  } catch (_) { /* Audio is an optional enhancement. */ }
}

document.addEventListener('keydown', event => {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '];
  if (keys.includes(event.key)) event.preventDefault();
  if (event.key === 'ArrowLeft') move(-1, 0);
  else if (event.key === 'ArrowRight') move(1, 0);
  else if (event.key === 'ArrowDown') { if (move(0, 1)) { score++; updateStats(); } }
  else if (event.key === 'ArrowUp') rotate();
  else if (event.key === ' ') hardDrop();
  else if (event.key.toLowerCase() === 'p') togglePause();
});

startButton.addEventListener('click', () => paused ? togglePause() : startGame());
soundButton.addEventListener('click', () => {
  soundOn = !soundOn;
  soundButton.setAttribute('aria-pressed', String(soundOn));
  soundButton.innerHTML = `<span>${soundOn ? '◖' : '—'}</span> SOUND ${soundOn ? 'ON' : 'OFF'}`;
  if (soundOn) beep(440, .05);
});

document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    const action = button.dataset.action;
    if (action === 'left') move(-1, 0);
    if (action === 'right') move(1, 0);
    if (action === 'down') move(0, 1);
    if (action === 'rotate') rotate();
    if (action === 'drop') hardDrop();
  });
});

draw();
drawNext();
