const APP_VERSION = "4";

const boardEl = document.getElementById("board");
const sizeSelect = document.getElementById("sizeSelect");
const resetBtn = document.getElementById("resetBtn");
const nextBtn = document.getElementById("nextBtn");
const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
const playerNameEl = document.getElementById("playerName");

let state = null;

function makeKey(r, c) {
  return `${r},${c}`;
}

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

function rectCellIndexes(rc, width) {
  const out = [];
  for (let r = rc.r1; r <= rc.r2; r++) {
    for (let c = rc.c1; c <= rc.c2; c++) {
      out.push(r * width + c);
    }
  }
  return out;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function delayFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// -------------------- Unique-solution puzzle generation --------------------

function generateRandomTiling(size) {
  const cfg = {
    10: { targetAvgArea: 4.0, maxArea: 10 },
    12: { targetAvgArea: 4.2, maxArea: 12 },
    18: { targetAvgArea: 4.0, maxArea: 8 },
  }[size] || { targetAvgArea: 4.2, maxArea: 12 };

  const w = size;
  const h = size;
  const rects = [{ r1: 0, c1: 0, r2: h - 1, c2: w - 1 }];
  const targetRects = Math.round((w * h) / cfg.targetAvgArea);

  let safety = 0;
  while (rects.length < targetRects && safety++ < 12000) {
    rects.sort((a, b) => rectArea(b) - rectArea(a));
    const pickCount = Math.min(10, rects.length);
    const idx = Math.floor(Math.random() * pickCount);
    const rc = rects[idx];

    const height = rc.r2 - rc.r1 + 1;
    const width = rc.c2 - rc.c1 + 1;
    if (height === 1 && width === 1) continue;

    const options = [];
    if (width > 1) {
      for (let split = rc.c1 + 1; split <= rc.c2; split++) {
        options.push(["v", split]);
      }
    }
    if (height > 1) {
      for (let split = rc.r1 + 1; split <= rc.r2; split++) {
        options.push(["h", split]);
      }
    }
    shuffleInPlace(options);

    let chosen = null;
    for (const [orientation, split] of options) {
      let a, b;
      if (orientation === "v") {
        a = { r1: rc.r1, c1: rc.c1, r2: rc.r2, c2: split - 1 };
        b = { r1: rc.r1, c1: split, r2: rc.r2, c2: rc.c2 };
      } else {
        a = { r1: rc.r1, c1: rc.c1, r2: split - 1, c2: rc.c2 };
        b = { r1: split, c1: rc.c1, r2: rc.r2, c2: rc.c2 };
      }

      const aArea = rectArea(a);
      const bArea = rectArea(b);
      const maxAllowed = Math.max(cfg.maxArea + 6, cfg.maxArea * 1.8);
      if (Math.max(aArea, bArea) > maxAllowed && Math.random() < 0.8) continue;

      chosen = [a, b];
      break;
    }

    if (!chosen) continue;
    rects.splice(idx, 1, chosen[0], chosen[1]);
  }

  safety = 0;
  while (safety++ < 12000) {
    const idx = rects.findIndex((rc) => rectArea(rc) > cfg.maxArea && (rc.r2 > rc.r1 || rc.c2 > rc.c1));
    if (idx === -1) break;

    const rc = rects[idx];
    const options = [];
    if (rc.c2 > rc.c1) {
      for (let split = rc.c1 + 1; split <= rc.c2; split++) {
        options.push(["v", split]);
      }
    }
    if (rc.r2 > rc.r1) {
      for (let split = rc.r1 + 1; split <= rc.r2; split++) {
        options.push(["h", split]);
      }
    }
    shuffleInPlace(options);
    const [orientation, split] = options[0] || [];
    if (!orientation) break;

    let a, b;
    if (orientation === "v") {
      a = { r1: rc.r1, c1: rc.c1, r2: rc.r2, c2: split - 1 };
      b = { r1: rc.r1, c1: split, r2: rc.r2, c2: rc.c2 };
    } else {
      a = { r1: rc.r1, c1: rc.c1, r2: split - 1, c2: rc.c2 };
      b = { r1: split, c1: rc.c1, r2: rc.r2, c2: rc.c2 };
    }

    rects.splice(idx, 1, a, b);
  }

  return rects;
}

function scoreClueCell(size, cell, area) {
  let score = 0;
  for (let rh = 1; rh <= area; rh++) {
    if (area % rh !== 0) continue;
    const cw = area / rh;
    if (rh > size || cw > size) continue;
    const rMin = Math.max(0, cell.r - rh + 1);
    const rMax = Math.min(cell.r, size - rh);
    const cMin = Math.max(0, cell.c - cw + 1);
    const cMax = Math.min(cell.c, size - cw);
    score += (rMax - rMin + 1) * (cMax - cMin + 1);
  }
  const edgeBias = Math.min(cell.r, size - 1 - cell.r, cell.c, size - 1 - cell.c) * 0.02;
  return score + edgeBias;
}

function buildPuzzleFromTiling(size, rects) {
  const clues = {};
  const clueList = [];

  rects.forEach((rc, idx) => {
    const area = rectArea(rc);
    const cellChoices = [];
    for (let r = rc.r1; r <= rc.r2; r++) {
      for (let c = rc.c1; c <= rc.c2; c++) {
        cellChoices.push({ r, c });
      }
    }
    shuffleInPlace(cellChoices);
    const sample = cellChoices.slice(0, Math.min(cellChoices.length, 10));

    let best = sample[0];
    let bestScore = Infinity;
    for (const cell of sample) {
      const score = scoreClueCell(size, cell, area);
      if (score < bestScore) {
        bestScore = score;
        best = cell;
      }
    }

    clues[makeKey(best.r, best.c)] = area;
    clueList.push({ id: idx, row: best.r, col: best.c, value: area });
  });

  return { w: size, h: size, clues, clueList };
}

function enumerateCandidates(puzzle) {
  const { w, h, clueList } = puzzle;
  const byClue = [];
  const cellToCandidates = Array.from({ length: w * h }, () => []);

  for (const clue of clueList) {
    const rows = [];
    const area = clue.value;

    for (let rh = 1; rh <= area; rh++) {
      if (area % rh !== 0) continue;
      const cw = area / rh;
      if (rh > h || cw > w) continue;

      const rMin = Math.max(0, clue.row - rh + 1);
      const rMax = Math.min(clue.row, h - rh);
      const cMin = Math.max(0, clue.col - cw + 1);
      const cMax = Math.min(clue.col, w - cw);

      for (let r1 = rMin; r1 <= rMax; r1++) {
        const r2 = r1 + rh - 1;
        for (let c1 = cMin; c1 <= cMax; c1++) {
          const c2 = c1 + cw - 1;

          let clueCount = 0;
          for (const other of clueList) {
            if (other.row >= r1 && other.row <= r2 && other.col >= c1 && other.col <= c2) {
              clueCount++;
              if (clueCount > 1) break;
            }
          }
          if (clueCount !== 1) continue;

          const rc = {
            clueId: clue.id,
            r1,
            c1,
            r2,
            c2,
            cells: rectCellIndexes({ r1, c1, r2, c2 }, w),
          };
          rows.push(rc);
          for (const cellIndex of rc.cells) {
            cellToCandidates[cellIndex].push(rc);
          }
        }
      }
    }

    byClue[clue.id] = rows;
  }

  return { byClue, cellToCandidates };
}

function countSolutions(puzzle, limit = 2) {
  const { w, h, clueList } = puzzle;
  const totalCells = w * h;
  const { byClue, cellToCandidates } = enumerateCandidates(puzzle);

  for (const clue of clueList) {
    if (!byClue[clue.id] || byClue[clue.id].length === 0) return 0;
  }

  const covered = new Uint8Array(totalCells);
  const clueAssigned = new Uint8Array(clueList.length);
  let assignedCount = 0;
  let solutions = 0;

  function fits(candidate) {
    if (clueAssigned[candidate.clueId]) return false;
    for (const cellIndex of candidate.cells) {
      if (covered[cellIndex]) return false;
    }
    return true;
  }

  function apply(candidate, on) {
    clueAssigned[candidate.clueId] = on ? 1 : 0;
    assignedCount += on ? 1 : -1;
    for (const cellIndex of candidate.cells) {
      covered[cellIndex] = on ? 1 : 0;
    }
  }

  function search() {
    if (solutions >= limit) return;

    if (assignedCount === clueList.length) {
      for (let i = 0; i < totalCells; i++) {
        if (!covered[i]) return;
      }
      solutions++;
      return;
    }

    let bestOptions = null;
    let bestCount = Infinity;

    for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
      if (covered[cellIndex]) continue;
      const options = [];
      for (const candidate of cellToCandidates[cellIndex]) {
        if (fits(candidate)) options.push(candidate);
      }
      if (options.length === 0) return;
      if (options.length < bestCount) {
        bestCount = options.length;
        bestOptions = options;
        if (bestCount === 1) break;
      }
    }

    for (const clue of clueList) {
      if (clueAssigned[clue.id]) continue;
      const options = [];
      for (const candidate of byClue[clue.id]) {
        if (fits(candidate)) options.push(candidate);
      }
      if (options.length === 0) return;
      if (options.length < bestCount) {
        bestCount = options.length;
        bestOptions = options;
        if (bestCount === 1) break;
      }
    }

    bestOptions = bestOptions.slice().sort((a, b) => a.cells.length - b.cells.length || Math.random() - 0.5);

    for (const candidate of bestOptions) {
      apply(candidate, true);
      search();
      apply(candidate, false);
      if (solutions >= limit) return;
    }
  }

  search();
  return solutions;
}

async function generateUniquePuzzle(size) {
  const tilingAttempts = size === 18 ? 70 : 40;
  const clueAttemptsPerTiling = size === 18 ? 30 : 10;

  for (let tilingTry = 0; tilingTry < tilingAttempts; tilingTry++) {
    const tiling = generateRandomTiling(size);

    for (let clueTry = 0; clueTry < clueAttemptsPerTiling; clueTry++) {
      const puzzle = buildPuzzleFromTiling(size, tiling);
      if (countSolutions(puzzle, 2) === 1) return puzzle;
    }

    if (tilingTry % 3 === 0) {
      await delayFrame();
    }
  }

  return null;
}

// -------------------- Game state --------------------

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
    generating: false,
  };
}

function setCellFont() {
  const n = state.w;
  const px = n <= 10 ? 16 : n <= 12 ? 14 : 12;
  boardEl.style.setProperty("--cell-font", `${px}px`);
}

function blankBoard(size) {
  return {
    w: size,
    h: size,
    clues: {},
    clueList: [],
  };
}

function initFromPuzzle(puzzle) {
  state = makeState(puzzle);
  setCellFont();
  renderBoard();
  clearPreview();
  resetTimer();
}

async function loadFreshPuzzle(size) {
  if (state?.generating) return;

  if (!state) {
    state = makeState(blankBoard(size));
  }
  state.generating = true;
  boardEl.classList.add("is-generating");
  nextBtn.disabled = true;
  resetBtn.disabled = true;
  sizeSelect.disabled = true;

  setStatus(size === 18 ? "Generating unique puzzle... this can take a moment." : "Generating unique puzzle...");
  initFromPuzzle(blankBoard(size));
  renderBoard();
  await delayFrame();

  let puzzle = await generateUniquePuzzle(size);
  if (!puzzle) {
    setStatus("Trying again...");
    await delayFrame();
    puzzle = await generateUniquePuzzle(size);
  }

  if (puzzle) {
    initFromPuzzle(puzzle);
    setStatus("");
  } else {
    initFromPuzzle(blankBoard(size));
    setStatus("Could not generate a unique puzzle. Tap Next Puzzle to try again.");
  }

  state.generating = false;
  boardEl.classList.remove("is-generating");
  nextBtn.disabled = false;
  resetBtn.disabled = false;
  sizeSelect.disabled = false;
}

// -------------------- Rendering --------------------

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

// -------------------- Rules --------------------

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

// -------------------- Input --------------------

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
  if (state.generating || state.solved) return;
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

sizeSelect.addEventListener("change", async () => {
  await loadFreshPuzzle(Number(sizeSelect.value));
});

resetBtn.addEventListener("click", () => {
  if (!state?.puzzle || state.generating) return;
  initFromPuzzle(state.puzzle);
  setStatus("");
});

nextBtn.addEventListener("click", async () => {
  await loadFreshPuzzle(Number(sizeSelect.value));
});

// -------------------- Boot --------------------

loadPlayerName();
loadFreshPuzzle(10);
