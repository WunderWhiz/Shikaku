/*
Shikaku / Rectangles (area) - web version

Rules enforced for a placement:
- rectangle contains exactly 1 clue number
- rectangle area equals that clue number
- rectangle does not overlap existing rectangles

Timer:
- starts on the first successful placement
- stops when the board is fully covered

Endless puzzles:
- "Next Puzzle" generates a new random puzzle for the selected size
*/

const boardEl = document.getElementById("board");
const sizeSelect = document.getElementById("sizeSelect");
const resetBtn = document.getElementById("resetBtn");
const nextBtn = document.getElementById("nextBtn");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
const playerNameEl = document.getElementById("playerName");

let state = null;

// -------------------- Utilities --------------------

function makeKey(r, c) { return `${r},${c}`; }

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function rectNorm(a, b) {
  const r1 = Math.min(a.r, b.r);
  const c1 = Math.min(a.c, b.c);
  const r2 = Math.max(a.r, b.r);
  const c2 = Math.max(a.c, b.c);
  return { r1, c1, r2, c2 };
}

function rectArea(rc) {
  return (rc.r2 - rc.r1 + 1) * (rc.c2 - rc.c1 + 1);
}

function rectKeys(rc) {
  const keys = [];
  for (let r = rc.r1; r <= rc.r2; r++) {
    for (let c = rc.c1; c <= rc.c2; c++) {
      keys.push(makeKey(r, c));
    }
  }
  return keys;
}

function cellFromEvent(e) {
  const target = e.target.closest(".cell");
  if (!target) return null;
  return { r: Number(target.dataset.r), c: Number(target.dataset.c) };
}

// -------------------- Puzzle Generator --------------------
// Generates a solvable puzzle by creating a random tiling into rectangles.
// Each rectangle gets exactly one clue number equal to its area placed in a random cell.
//
// Notes:
// - This does not guarantee a unique solution. It guarantees at least one solution.
function generatePuzzle(size) {
  const w = size, h = size;

  const desiredRects = Math.round((w * h) / 6); // 10->17, 12->24, 18->54
  const maxRects = Math.round(desiredRects * 1.35);
  const minRects = Math.max(8, Math.round(desiredRects * 0.75));

  const params = {
    10: { targetMaxArea: 14, stopBias: 0.10 },
    12: { targetMaxArea: 18, stopBias: 0.12 },
    18: { targetMaxArea: 28, stopBias: 0.15 },
  }[size] || { targetMaxArea: 18, stopBias: 0.12 };

  // Start with one big rectangle
  let rects = [{ r1: 0, c1: 0, r2: h - 1, c2: w - 1 }];

  function canSplit(rc) {
    const height = rc.r2 - rc.r1 + 1;
    const width = rc.c2 - rc.c1 + 1;
    return width > 1 || height > 1;
  }

  function splitOnce(rc) {
    const height = rc.r2 - rc.r1 + 1;
    const width = rc.c2 - rc.c1 + 1;

    let orientation = "v";
    if (width === 1 && height > 1) orientation = "h";
    else if (height === 1 && width > 1) orientation = "v";
    else {
      // Weight the split toward the longer side
      const vWeight = width / (width + height);
      orientation = (Math.random() < vWeight) ? "v" : "h";
    }

    if (orientation === "v") {
      // split columns
      const splitCol = rc.c1 + Math.floor(Math.random() * (width - 1)) + 1; // between c1+1..c2
      const a = { r1: rc.r1, c1: rc.c1, r2: rc.r2, c2: splitCol - 1 };
      const b = { r1: rc.r1, c1: splitCol, r2: rc.r2, c2: rc.c2 };
      return [a, b];
    } else {
      // split rows
      const splitRow = rc.r1 + Math.floor(Math.random() * (height - 1)) + 1; // between r1+1..r2
      const a = { r1: rc.r1, c1: rc.c1, r2: splitRow - 1, c2: rc.c2 };
      const b = { r1: splitRow, c1: rc.c1, r2: rc.r2, c2: rc.c2 };
      return [a, b];
    }
  }

  // Keep splitting until we hit a good density of rectangles and the pieces aren't huge
  let safety = 0;
  while (safety++ < 20000) {
    // Pick a rectangle biased toward larger area
    rects.sort((x, y) => rectArea(y) - rectArea(x));
    const largest = rects[0];

    const area = rectArea(largest);
    const enoughRects = rects.length >= desiredRects;
    const tooManyRects = rects.length >= maxRects;

    // Stop conditions
    if (tooManyRects) break;
    if (enoughRects && area <= params.targetMaxArea && Math.random() < (0.65 + params.stopBias)) break;

    // Choose a rect to split: mostly one of the top few largest
    const pickPool = Math.min(6, rects.length);
    const idx = Math.floor(Math.random() * pickPool);
    const rc = rects[idx];

    if (!canSplit(rc)) {
      // Can't split, remove from consideration by moving it back in list
      rects.push(rects.splice(idx, 1)[0]);
      continue;
    }

    const [a, b] = splitOnce(rc);

    // Avoid creating too many 1-cell rectangles
    const aArea = rectArea(a);
    const bArea = rectArea(b);
    const tinyPenalty = (aArea === 1 ? 1 : 0) + (bArea === 1 ? 1 : 0);
    if (tinyPenalty > 0 && Math.random() < 0.75) {
      // Retry a different split most of the time
      continue;
    }

    rects.splice(idx, 1, a, b);

    // Early stop if we reached minimum and pieces are small-ish
    if (rects.length >= minRects) {
      const biggest = Math.max(...rects.map(rectArea));
      if (rects.length >= desiredRects && biggest <= params.targetMaxArea && Math.random() < 0.35) break;
    }
  }

  // If generation produced too many 1s, regenerate (light sanity check)
  const ones = rects.filter(r => rectArea(r) === 1).length;
  if (ones / rects.length > 0.16 && size >= 12) {
    return generatePuzzle(size);
  }

  // Place one clue per rectangle
  const clues = {};
  for (const rc of rects) {
    const area = rectArea(rc);
    const r = rc.r1 + Math.floor(Math.random() * (rc.r2 - rc.r1 + 1));
    const c = rc.c1 + Math.floor(Math.random() * (rc.c2 - rc.c1 + 1));
    clues[makeKey(r, c)] = area;
  }

  return { w, h, clues };
}

// -------------------- Game State --------------------

function makeState(puzzle) {
  return {
    w: puzzle.w,
    h: puzzle.h,
    clues: puzzle.clues,

    rectangles: new Map(),   // id -> {r1,c1,r2,c2}
    cellOwner: new Map(),    // "r,c" -> id
    nextRectId: 1,

    dragging: false,
    dragStart: null,
    dragEnd: null,
    previewEl: null,

    // Timer
    timerRunning: false,
    startTs: 0,
    elapsedMs: 0,
    timerHandle: null,
    solved: false
  };
}

function setCellFont() {
  const n = state.w;
  // Keep numbers readable across sizes
  const px = (n <= 10) ? 16 : (n <= 12) ? 14 : 12;
  boardEl.style.setProperty("--cell-font", `${px}px`);
}

function init(size, freshPuzzle = true) {
  const puzzle = freshPuzzle ? generatePuzzle(size) : state?.puzzle;
  state = makeState(puzzle);
  state.puzzle = puzzle;

  setCellFont();
  renderBoard();
  clearPreview();
  resetTimer();
  setStatus("");
}

// -------------------- Rendering --------------------

function renderBoard() {
  const { w, h } = state;

  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${w}, 1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${h}, 1fr)`;

  const frag = document.createDocumentFragment();

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);

      const k = makeKey(r, c);
      const clue = state.clues[k];
      if (clue !== undefined) cell.textContent = String(clue);

      if (state.cellOwner.has(k)) cell.classList.add("filled");
      frag.appendChild(cell);
    }
  }

  boardEl.appendChild(frag);
}

function showPreview(rc) {
  if (!state.previewEl) {
    const el = document.createElement("div");
    el.className = "previewBox";
    state.previewEl = el;
    boardEl.appendChild(el);
  }

  const boardRect = boardEl.getBoundingClientRect();
  const cellW = boardRect.width / state.w;
  const cellH = boardRect.height / state.h;

  const left = rc.c1 * cellW;
  const top = rc.r1 * cellH;
  const width = (rc.c2 - rc.c1 + 1) * cellW;
  const height = (rc.r2 - rc.r1 + 1) * cellH;

  state.previewEl.style.left = `${left}px`;
  state.previewEl.style.top = `${top}px`;
  state.previewEl.style.width = `${width}px`;
  state.previewEl.style.height = `${height}px`;
}

function clearPreview() {
  if (state?.previewEl) state.previewEl.remove();
  if (state) state.previewEl = null;
}

// -------------------- Rules --------------------

function countCluesInRect(rc) {
  let count = 0;
  let clueValue = null;

  for (let r = rc.r1; r <= rc.r2; r++) {
    for (let c = rc.c1; c <= rc.c2; c++) {
      const k = makeKey(r, c);
      const v = state.clues[k];
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
  if (count !== 1) return false;
  if (rectArea(rc) !== clueValue) return false;
  if (rectOverlapsExisting(rc)) return false;
  return true;
}

function addRect(rc) {
  const id = state.nextRectId++;
  state.rectangles.set(id, rc);
  for (const k of rectKeys(rc)) state.cellOwner.set(k, id);
}

function removeRectById(id) {
  const rc = state.rectangles.get(id);
  if (!rc) return;
  for (const k of rectKeys(rc)) state.cellOwner.delete(k);
  state.rectangles.delete(id);
}

function removeRectAtCell(r, c) {
  const id = state.cellOwner.get(makeKey(r, c));
  if (!id) return false;
  removeRectById(id);
  return true;
}

function isSolved() {
  return state.cellOwner.size === state.w * state.h;
}

// -------------------- Timer --------------------

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

// -------------------- Input handling (mouse + touch) --------------------

function onPointerDown(e) {
  const cell = cellFromEvent(e);
  if (!cell) return;

  // Tap any filled cell to delete its rectangle immediately.
  const removed = removeRectAtCell(cell.r, cell.c);
  if (removed) {
    renderBoard();
    clearPreview();
    setStatus("");
    return;
  }

  // Start drawing.
  state.dragging = true;
  state.dragStart = cell;
  state.dragEnd = cell;
  boardEl.setPointerCapture(e.pointerId);
  showPreview(rectNorm(state.dragStart, state.dragEnd));
}

function onPointerMove(e) {
  if (!state.dragging) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  state.dragEnd = cell;
  showPreview(rectNorm(state.dragStart, state.dragEnd));
}

function onPointerUp(e) {
  if (!state.dragging) return;
  state.dragging = false;

  const rc = rectNorm(state.dragStart, state.dragEnd);
  clearPreview();

  // Invalid moves place nothing (matches your app behavior)
  if (!isValidRect(rc)) return;

  const wasEmptyBefore = state.rectangles.size === 0;
  addRect(rc);
  renderBoard();

  // Timer starts on the first successful placement
  if (wasEmptyBefore) startTimerIfNeeded();

  // Stop when solved
  if (!state.solved && isSolved()) {
    state.solved = true;
    stopTimer();
    setStatus(`Solved! Final time: ${fmtTime(state.elapsedMs)}`);
  } else {
    setStatus("");
  }
}

function onPointerCancel() {
  state.dragging = false;
  clearPreview();
}

boardEl.addEventListener("pointerdown", onPointerDown);
boardEl.addEventListener("pointermove", onPointerMove);
boardEl.addEventListener("pointerup", onPointerUp);
boardEl.addEventListener("pointercancel", onPointerCancel);

// -------------------- Controls --------------------

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

sizeSelect.addEventListener("change", () => {
  init(Number(sizeSelect.value), true);
});

resetBtn.addEventListener("click", () => {
  // Reset keeps the same puzzle, just clears placements and timer
  init(Number(sizeSelect.value), false);
});

nextBtn.addEventListener("click", () => {
  init(Number(sizeSelect.value), true);
});

// -------------------- Boot --------------------
loadPlayerName();
init(10, true);
