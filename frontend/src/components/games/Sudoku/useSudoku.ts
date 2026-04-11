import { useReducer, useCallback } from 'react';

export type Difficulty = 'easy' | 'medium' | 'hard';

const REMOVE_COUNT: Record<Difficulty, number> = { easy: 35, medium: 45, hard: 54 };

export interface CellData {
  readonly value: number; // 0 = empty
  readonly fixed: boolean;
  readonly error: boolean;
  readonly notes: readonly number[];
}

export interface SudokuState {
  readonly board: readonly (readonly CellData[])[];
  readonly solution: readonly (readonly number[])[];
  readonly selectedCell: { row: number; col: number } | null;
  readonly difficulty: Difficulty;
  readonly completed: boolean;
  readonly elapsedSeconds: number;
  readonly mistakes: number;
}

type Action =
  | { type: 'select'; row: number; col: number }
  | { type: 'input'; value: number }
  | { type: 'note'; value: number }
  | { type: 'erase' }
  | { type: 'reset'; difficulty: Difficulty }
  | { type: 'tick' };

// ── Sudoku Generator ──

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValid(grid: number[][], row: number, col: number, num: number): boolean {
  for (let c = 0; c < 9; c++) if (grid[row][c] === num) return false;
  for (let r = 0; r < 9; r++) if (grid[r][col] === num) return false;
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r][c] === num) return false;
    }
  }
  return true;
}

function solve(grid: number[][]): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== 0) continue;
      const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const n of nums) {
        if (isValid(grid, r, c, n)) {
          grid[r][c] = n;
          if (solve(grid)) return true;
          grid[r][c] = 0;
        }
      }
      return false;
    }
  }
  return true;
}

function generatePuzzle(difficulty: Difficulty): { puzzle: number[][]; solution: number[][] } {
  const grid: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  solve(grid);
  const solution = grid.map(r => [...r]);

  const puzzle = grid.map(r => [...r]);
  const positions = shuffle(
    Array.from({ length: 81 }, (_, i) => ({ row: Math.floor(i / 9), col: i % 9 })),
  );
  let removed = 0;
  const target = REMOVE_COUNT[difficulty];
  for (const { row, col } of positions) {
    if (removed >= target) break;
    puzzle[row][col] = 0;
    removed++;
  }

  return { puzzle, solution };
}

function createBoard(puzzle: number[][]): CellData[][] {
  return puzzle.map(row =>
    row.map(value => ({
      value,
      fixed: value !== 0,
      error: false,
      notes: [],
    })),
  );
}

function checkErrors(board: CellData[][], solution: readonly (readonly number[])[]): CellData[][] {
  return board.map((row, r) =>
    row.map((cell, c) => ({
      ...cell,
      error: !cell.fixed && cell.value !== 0 && cell.value !== solution[r][c],
    })),
  );
}

function isComplete(board: readonly (readonly CellData[])[], solution: readonly (readonly number[])[]): boolean {
  return board.every((row, r) =>
    row.every((cell, c) => cell.value === solution[r][c]),
  );
}

function initState(difficulty: Difficulty): SudokuState {
  const { puzzle, solution } = generatePuzzle(difficulty);
  return {
    board: createBoard(puzzle),
    solution,
    selectedCell: null,
    difficulty,
    completed: false,
    elapsedSeconds: 0,
    mistakes: 0,
  };
}

function reducer(state: SudokuState, action: Action): SudokuState {
  if (action.type === 'reset') return initState(action.difficulty);

  if (action.type === 'tick') {
    if (state.completed) return state;
    return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };
  }

  if (action.type === 'select') {
    return { ...state, selectedCell: { row: action.row, col: action.col } };
  }

  if (!state.selectedCell || state.completed) return state;
  const { row, col } = state.selectedCell;
  const cell = state.board[row][col];
  if (cell.fixed) return state;

  if (action.type === 'erase') {
    const newBoard = state.board.map((r, ri) =>
      r.map((c, ci) => (ri === row && ci === col ? { ...c, value: 0, notes: [], error: false } : c)),
    );
    return { ...state, board: newBoard };
  }

  if (action.type === 'note') {
    const notes = cell.notes.includes(action.value)
      ? cell.notes.filter(n => n !== action.value)
      : [...cell.notes, action.value];
    const newBoard = state.board.map((r, ri) =>
      r.map((c, ci) => (ri === row && ci === col ? { ...c, notes, value: 0 } : c)),
    );
    return { ...state, board: newBoard };
  }

  // Input number
  const newBoard = state.board.map((r, ri) =>
    r.map((c, ci) => (ri === row && ci === col ? { ...c, value: action.value, notes: [] } : c)),
  );
  const checked = checkErrors(newBoard.map(r => r.map(c => ({ ...c }))), state.solution);
  const isError = checked[row][col].error;
  const completed = isComplete(checked, state.solution);

  return {
    ...state,
    board: checked,
    completed,
    mistakes: isError ? state.mistakes + 1 : state.mistakes,
  };
}

export function useSudoku(initialDifficulty: Difficulty = 'easy') {
  const [state, dispatch] = useReducer(reducer, initialDifficulty, initState);

  const select = useCallback((row: number, col: number) => dispatch({ type: 'select', row, col }), []);
  const input = useCallback((value: number) => dispatch({ type: 'input', value }), []);
  const note = useCallback((value: number) => dispatch({ type: 'note', value }), []);
  const erase = useCallback(() => dispatch({ type: 'erase' }), []);
  const reset = useCallback((difficulty: Difficulty) => dispatch({ type: 'reset', difficulty }), []);
  const tick = useCallback(() => dispatch({ type: 'tick' }), []);

  return { ...state, select, input, note, erase, reset, tick };
}
