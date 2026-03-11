const boardEl = document.getElementById("board");
const sizeSelect = document.getElementById("sizeSelect");
const resetBtn = document.getElementById("resetBtn");
const nextBtn = document.getElementById("nextBtn");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
const playerNameEl = document.getElementById("playerName");

let state = null;

function makeKey(r, c) { return `${r},${c}`; }

function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function rectNorm(a, b) {
  return {
    r1: Math.min(a.r, b.r),
    c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r),
    c2: Math.max(a.c, b.c),
  };
}

function rectArea(rc) {
  return (rc.r2 - rc.r1 + 1) * (rc.c2 - rc.c1 + 1);
}

function rectKeys(rc) {
  const out = [];
  for (let r = rc.r1; r <= rc.r2; r++) {
    for (let c = rc.c1; c <= rc.c2; c++) {
      out.push(makeKey(r, c));
    }
  }
  return out;
}

function generatePuzzle(size) {
  const w = size, h = size;
  const desiredRects = Math.round((w * h) / 6);
  const maxRects = Math.round(desiredRects * 1.35);
  const minRects = Math.max(8, Math.round(desiredRects * 0.75));

  const params = {
    10: { targetMaxArea: 14, stopBias: 0.10 },
    12: { targetMaxArea: 18, stopBias: 0.12 },
    18: { targetMaxArea: 28, stopBias: 0.15 },
  }[size] || { targetMaxArea: 18, stopBias: 0.12 };

  let rects = [{ r1: 0, c1: 0, r2: h - 1, c2: w - 1 }];

  function canSplit(rc) {
    return (rc.c2 - rc.c1 + 1) > 1 || (rc.r2 - rc.r1 + 1) > 1;
  }

  function splitOnce(rc) {
    const height = rc.r2 - rc.r1 + 1;
    const width = rc.c2 - rc.c1 + 1;
    let orientation = "v";

    if (width === 1) orientation = "h";
    else if (height === 1) orientation = "v";
    else orientation = Math.random() < width / (width + height) ? "v" : "h";

    if (orientation === "v") {
      const splitCol = rc.c1 + Math.floor(Math.random() * (width - 1)) + 1;
      return [
        { r1: rc.r1, c1: rc.c1, r2: rc.r2, c2: splitCol - 1 },
        { r1: rc.r1, c1: splitCol, r2: rc.r2, c2: rc.c2 }
      ];
    } else {
      const splitRow = rc.r1 + Math.floor(Math.random() * (height - 1)) + 1;
      return [
        { r1: rc.r1, c1: rc.c1, r2: splitRow - 1, c2: rc.c2 },
        { r1: splitRow, c1: rc.c1, r2: rc.r2, c2: rc.c2 }
      ];
    }
  }

  let safety = 0;
  while (safety++ < 20000) {
    rects.sort((a, b) => rectArea(b) - rectArea(a));
    const largest = rects[0];
    const enoughRects = rects.length >= desiredRects;
    const tooManyRects = rects.length >= maxRects;

    if (tooManyRects) break;
    if (enoughRects && rectArea(largest) <= params.targetMaxArea && Math.random() < (0.65 + params.stopBias)) break;

    const pickPool = Math.min(6, rects.length);
    const idx = Math.floor(Math.random() * pickPool);
    const rc = rects[idx];
    if (!canSplit(rc)) continue;

    const [a, b] = splitOnce(rc);
    const tinyPenalty = (rectArea(a) === 1 ? 1 : 0) + (rectArea(b) === 1 ? 1 : 0);
    if (tinyPenalty > 0 && Math.random() < 0.75) continue;

    rects.splice(idx, 1, a, b);

    if (rects.length >= minRects) {
      const biggest = Math.max(...rects.map(rectArea));
      if (rects.length >= desiredRects && biggest <= params.targetMaxArea && Math.random() < 0.35) break;
    }
  }

  const clues = {};
  for (const rc of rects) {
    const area = rectArea(rc);
    const r = rc.r1 + Math.floor(Math.random() * (rc.r2 - rc.r1 + 1));
    const c = rc.c1 + Math.floor(Math.random() * (rc.r2 - rc.r1 + 1)) % (rc.c2 - rc.c1 + 1) + rc.c1;
    clues[makeKey(r, c)] = area;
  }

  return { w, h, clues };
}

function makeState(puzzle) {
  return {
    w: puzzle.w,
    h: puzzle.h,
    clues: puzzle.clues,
    puzzle,
    rectangles: new Map(),
    cellOwner: new Map(),
    nextRectId: 1,
    dragging: false,
    dragStart: null,
    dragEnd: null,
    previewEl: null,
    timerRunning: false,
    startTs: 0,
    elapsedMs: 0,
    timerHandle: null,
    solved: false,
  };
}

function setCellFont() {
  const n = state.w;
  const px = n <= 10 ? 16 : n <= 12 ? 14 : 12;
  boardEl.style.setProperty("--cell-font", `${px}px`);
}

function init(size, freshPuzzle = true) {
  const puzzle = freshPuzzle ? generatePuzzle(size) : state?.puzzle;
  state = makeState(puzzle);
  setCellFont();
  renderBoard();
  clearPreview();
  resetTimer();
  setStatus("");
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${state.w}, 1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${state.h}, 1fr)`;

  const frag = document.createDocumentFragment();
  for (let r = 0; r < state.h; r++) {
    for (let c = 0; c < state.w; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const k = makeKey(r, c);
      if (state.clues[k] !== undefined) cell.textContent = String(state.clues[k]);
      if (state.cellOwner.has(k)) cell.classList.add("filled");
      frag.appendChild(cell);
    }
  }
  boardEl.appendChild(frag);
}

function showPreview(rc) {
  if (!state.previewEl) {
    state.previewEl = document.createElement("div");
    state.previewEl.className = "previewBox";
    boardEl.appendChild(state.previewEl);
  }

  const rect = boardEl.getBoundingClientRect();
  const cellW = rect.width / state.w;
  const cellH = rect.height / state.h;

  state.previewEl.style.left = `${rc.c1 * cellW}px`;
  state.previewEl.style.top = `${rc.r1 * cellH}px`;
  state.previewEl.style.width = `${(rc.c2 - rc.c1 + 1) * cellW}px`;
  state.previewEl.style.height = `${(rc.r2 - rc.r1 + 1) * cellH}px`;
}

function clearPreview() {
  if (state?.previewEl) state.previewEl.remove();
  if (state) state.previewEl = null;
}

function countCluesInRect(rc) {
  let count = 0;
  let clueValue = null;

  for (let r = rc.r1; r <= rc.r2; r++) {
    for (let c = rc.c1; c <= rc.c2; c++) {
      const v = state.clues[makeKey(r, c)];
      if (v !== undefined) {
        count++;
        clueValue = v;
        if (count > 1) return { count, clueValue: null };
      }
    }
  }
  return { count, clueValue };
}

function rectOverlapsExisting(rc) {
  for (const k of rectKeys(rc)) {
    if (state.cellOwner.has(k)) return true;
  }
  return false;
}

function isValidRect(rc) {
  const { count, clueValue } = countCluesInRect(rc);
  return count === 1 && rectArea(rc) === clueValue && !rectOverlapsExisting(rc);
}

function addRect(rc) {
  const id = state.nextRectId++;
  state.rectangles.set(id, rc);
  for (const k of rectKeys(rc)) state.cellOwner.set(k, id);
}

function removeRectAtCell(r, c) {
  const id = state.cellOwner.get(makeKey(r, c));
  if (!id) return false;
  const rc = state.rectangles.get(id);
  for (const k of rectKeys(rc)) state.cellOwner.delete(k);
  state.rectangles.delete(id);
  return true;
}

function isSolved() {
  return state.cellOwner.size === state.w * state.h;
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function resetTimer() {
  stopTimer();
  state.elapsedMs = 0;
  timerEl.textContent = "00:00";
  state.timerRunning = false;
  state.startTs = 0;
  state.solved = false;
}

function startTimerIfNeeded() {
  if (state.timerRunning) return;
  state.timerRunning = true;
  state.startTs = performance.now() - state.elapsedMs;

  const tick = () => {
    if (!state.timerRunning) return;
    state.elapsedMs = performance.now() - state.startTs;
    timerEl.textContent = fmtTime(state.elapsedMs);
    state.timerHandle = requestAnimationFrame(tick);
  };
  state.timerHandle = requestAnimationFrame(tick);
}

function stopTimer() {
  state.timerRunning = false;
  if (state.timerHandle) cancelAnimationFrame(state.timerHandle);
  state.timerHandle = null;
}

function cellFromPoint(clientX, clientY) {
  const rect = boardEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;

  return {
    r: Math.floor((y / rect.height) * state.h),
    c: Math.floor((x / rect.width) * state.w),
  };
}

function beginAtPoint(clientX, clientY) {
  const cell = cellFromPoint(clientX, clientY);
  if (!cell) return;

  const removed = removeRectAtCell(cell.r, cell.c);
  if (removed) {
    renderBoard();
    clearPreview();
    setStatus("");
    return;
  }

  state.dragging = true;
  state.dragStart = cell;
  state.dragEnd = cell;
  showPreview(rectNorm(state.dragStart, state.dragEnd));
}

function moveAtPoint(clientX, clientY) {
  if (!state.dragging) return;
  const cell = cellFromPoint(clientX, clientY);
  if (!cell) return;
  state.dragEnd = cell;
  showPreview(rectNorm(state.dragStart, state.dragEnd));
}

function endDrag() {
  if (!state.dragging) return;
  state.dragging = false;

  const rc = rectNorm(state.dragStart, state.dragEnd);
  clearPreview();

  if (!isValidRect(rc)) return;

  const firstPlacement = state.rectangles.size === 0;
  addRect(rc);
  renderBoard();

  if (firstPlacement) startTimerIfNeeded();

  if (!state.solved && isSolved()) {
    state.solved = true;
    stopTimer();
    setStatus(`Solved! Final time: ${fmtTime(state.elapsedMs)}`);
  } else {
    setStatus("");
  }
}

boardEl.addEventListener("mousedown", (e) => {
  e.preventDefault();
  beginAtPoint(e.clientX, e.clientY);
});

window.addEventListener("mousemove", (e) => {
  if (!state?.dragging) return;
  e.preventDefault();
  moveAtPoint(e.clientX, e.clientY);
});

window.addEventListener("mouseup", (e) => {
  if (!state?.dragging) return;
  e.preventDefault();
  endDrag();
});

boardEl.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  if (!t) return;
  beginAtPoint(t.clientX, t.clientY);
}, { passive: false });

window.addEventListener("touchmove", (e) => {
  if (!state?.dragging) return;
  e.preventDefault();
  const t = e.changedTouches[0];
  if (!t) return;
  moveAtPoint(t.clientX, t.clientY);
}, { passive: false });

window.addEventListener("touchend", (e) => {
  if (!state?.dragging) return;
  e.preventDefault();
  endDrag();
}, { passive: false });

window.addEventListener("touchcancel", (e) => {
  if (!state?.dragging) return;
  e.preventDefault();
  state.dragging = false;
  clearPreview();
}, { passive: false });

function savePlayerName() {
  try {
    localStorage.setItem("shikaku_playerName", playerNameEl.value || "");
  } catch (_) {}
}

function loadPlayerName() {
  try {
    const v = localStorage.getItem("shikaku_playerName");
    if (v) playerNameEl.value = v;
  } catch (_) {}
}

playerNameEl.addEventListener("input", savePlayerName);
sizeSelect.addEventListener("change", () => init(Number(sizeSelect.value), true));
resetBtn.addEventListener("click", () => init(Number(sizeSelect.value), false));
nextBtn.addEventListener("click", () => init(Number(sizeSelect.value), true));

loadPlayerName();
init(10, true);
