import { useReducer, useCallback, useRef, useEffect } from 'react';

export type CellState = 'hidden' | 'revealed' | 'flagged';

export interface Cell {
  readonly mine: boolean;
  readonly state: CellState;
  readonly adjacentMines: number;
}

export interface Difficulty {
  readonly label: string;
  readonly rows: number;
  readonly cols: number;
  readonly mines: number;
}

export const DIFFICULTIES: readonly Difficulty[] = [
  { label: '초급', rows: 9, cols: 9, mines: 10 },
  { label: '중급', rows: 16, cols: 16, mines: 40 },
  { label: '고급', rows: 16, cols: 30, mines: 99 },
];

export interface GameState {
  readonly board: readonly (readonly Cell[])[];
  readonly rows: number;
  readonly cols: number;
  readonly totalMines: number;
  readonly flagCount: number;
  readonly status: 'idle' | 'playing' | 'won' | 'lost';
  readonly revealedCount: number;
  readonly firstClick: boolean;
  readonly elapsedSeconds: number;
}

type Action =
  | { type: 'reveal'; row: number; col: number }
  | { type: 'flag'; row: number; col: number }
  | { type: 'reset'; difficulty: Difficulty }
  | { type: 'tick' };

function createBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (): Cell => ({
      mine: false, state: 'hidden', adjacentMines: 0,
    })),
  );
}

function placeMines(
  board: Cell[][],
  rows: number,
  cols: number,
  mines: number,
  safeRow: number,
  safeCol: number,
): Cell[][] {
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (newBoard[r][c].mine) continue;
    if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
    newBoard[r][c] = { ...newBoard[r][c], mine: true };
    placed++;
  }
  // Calculate adjacent counts
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (newBoard[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && newBoard[nr][nc].mine) {
            count++;
          }
        }
      }
      newBoard[r][c] = { ...newBoard[r][c], adjacentMines: count };
    }
  }
  return newBoard;
}

function floodReveal(board: Cell[][], rows: number, cols: number, startRow: number, startCol: number): { board: Cell[][]; revealed: number } {
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  const queue: [number, number][] = [[startRow, startCol]];
  let revealed = 0;

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    if (newBoard[r][c].state !== 'hidden') continue;

    newBoard[r][c] = { ...newBoard[r][c], state: 'revealed' };
    revealed++;

    if (newBoard[r][c].adjacentMines === 0 && !newBoard[r][c].mine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          queue.push([r + dr, c + dc]);
        }
      }
    }
  }

  return { board: newBoard, revealed };
}

function revealAll(board: Cell[][]): Cell[][] {
  return board.map(row => row.map(cell => ({ ...cell, state: 'revealed' })));
}

function initState(difficulty: Difficulty): GameState {
  return {
    board: createBoard(difficulty.rows, difficulty.cols),
    rows: difficulty.rows,
    cols: difficulty.cols,
    totalMines: difficulty.mines,
    flagCount: 0,
    status: 'idle',
    revealedCount: 0,
    firstClick: true,
    elapsedSeconds: 0,
  };
}

function reducer(state: GameState, action: Action): GameState {
  if (action.type === 'reset') return initState(action.difficulty);

  if (action.type === 'tick') {
    if (state.status !== 'playing') return state;
    return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };
  }

  if (state.status === 'won' || state.status === 'lost') return state;

  const { row, col } = action as { row: number; col: number };
  if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return state;

  if (action.type === 'flag') {
    const cell = state.board[row][col];
    if (cell.state === 'revealed') return state;

    const newState = cell.state === 'flagged' ? 'hidden' : 'flagged';
    const flagDelta = newState === 'flagged' ? 1 : -1;
    const newBoard = state.board.map((r, ri) =>
      r.map((c, ci) => (ri === row && ci === col ? { ...c, state: newState as CellState } : c)),
    );

    return { ...state, board: newBoard, flagCount: state.flagCount + flagDelta, status: state.status === 'idle' ? 'playing' : state.status };
  }

  // Reveal
  const cell = state.board[row][col];
  if (cell.state !== 'hidden') return state;

  // First click — place mines avoiding clicked cell
  let currentBoard = state.board.map(r => r.map(c => ({ ...c })));
  if (state.firstClick) {
    currentBoard = placeMines(currentBoard, state.rows, state.cols, state.totalMines, row, col);
  }

  // Hit mine
  if (currentBoard[row][col].mine) {
    return {
      ...state,
      board: revealAll(currentBoard),
      status: 'lost',
      firstClick: false,
    };
  }

  // Flood reveal
  const { board: revealedBoard, revealed } = floodReveal(currentBoard, state.rows, state.cols, row, col);
  const totalRevealed = state.revealedCount + revealed;
  const totalSafe = state.rows * state.cols - state.totalMines;
  const won = totalRevealed >= totalSafe;

  return {
    ...state,
    board: won ? revealAll(revealedBoard) : revealedBoard,
    status: won ? 'won' : 'playing',
    revealedCount: totalRevealed,
    firstClick: false,
  };
}

export function useMinesweeper(initialDifficulty: Difficulty = DIFFICULTIES[0]) {
  const [state, dispatch] = useReducer(reducer, initialDifficulty, initState);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.status === 'playing') {
      timerRef.current = setInterval(() => dispatch({ type: 'tick' }), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.status]);

  const reveal = useCallback((row: number, col: number) => {
    dispatch({ type: 'reveal', row, col });
  }, []);

  const flag = useCallback((row: number, col: number) => {
    dispatch({ type: 'flag', row, col });
  }, []);

  const reset = useCallback((difficulty: Difficulty) => {
    dispatch({ type: 'reset', difficulty });
  }, []);

  return { ...state, reveal, flag, reset };
}
