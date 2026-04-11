import { useReducer, useCallback } from 'react';

export interface Tile {
  readonly id: number;
  readonly value: number;
  readonly row: number;
  readonly col: number;
  readonly mergedFrom?: boolean;
  readonly isNew?: boolean;
}

export interface GameState {
  readonly tiles: readonly Tile[];
  readonly score: number;
  readonly gameOver: boolean;
  readonly won: boolean;
  readonly grid: readonly (readonly (number | null)[])[];
}

type Direction = 'up' | 'down' | 'left' | 'right';
type Action = { type: 'move'; direction: Direction } | { type: 'reset' };

const SIZE = 4;
let nextId = 1;

function createEmptyGrid(): (number | null)[][] {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null) as (number | null)[]);
}

function getAvailableCells(grid: readonly (readonly (number | null)[])[]) {
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === null) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

function addRandomTile(tiles: Tile[], grid: (number | null)[][]): Tile[] {
  const available = getAvailableCells(grid);
  if (available.length === 0) return tiles;
  const cell = available[Math.floor(Math.random() * available.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  const tile: Tile = { id: nextId++, value, row: cell.row, col: cell.col, isNew: true };
  grid[cell.row][cell.col] = tile.id;
  return [...tiles, tile];
}

function buildGrid(tiles: readonly Tile[]): (number | null)[][] {
  const grid = createEmptyGrid();
  for (const tile of tiles) {
    grid[tile.row][tile.col] = tile.id;
  }
  return grid;
}

function canMove(tiles: readonly Tile[], grid: readonly (readonly (number | null)[])[]): boolean {
  if (getAvailableCells(grid).length > 0) return true;
  const tileMap = new Map(tiles.map(t => [t.id, t]));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const id = grid[r][c];
      if (id === null) continue;
      const tile = tileMap.get(id)!;
      // Check right neighbor
      if (c < SIZE - 1) {
        const rightId = grid[r][c + 1];
        if (rightId !== null && tileMap.get(rightId)!.value === tile.value) return true;
      }
      // Check bottom neighbor
      if (r < SIZE - 1) {
        const bottomId = grid[r + 1][c];
        if (bottomId !== null && tileMap.get(bottomId)!.value === tile.value) return true;
      }
    }
  }
  return false;
}

interface MoveResult {
  tiles: Tile[];
  score: number;
  moved: boolean;
}

function moveTiles(tiles: readonly Tile[], direction: Direction): MoveResult {
  const tileMap = new Map(tiles.map(t => [t.id, { ...t, mergedFrom: false, isNew: false }]));
  const grid = buildGrid(tiles);
  let scoreGain = 0;
  let moved = false;
  const mergedIds = new Set<number>();
  const removedIds = new Set<number>();

  const traversals = getTraversals(direction);

  for (const { row, col } of traversals) {
    const id = grid[row][col];
    if (id === null) continue;

    const tile = tileMap.get(id)!;
    const { farthest, next } = findFarthestPosition(grid, row, col, direction);

    // Check if we can merge with the next tile
    if (next) {
      const nextId = grid[next.row][next.col];
      if (nextId !== null && !mergedIds.has(nextId)) {
        const nextTile = tileMap.get(nextId)!;
        if (nextTile.value === tile.value) {
          // Merge
          const newValue = tile.value * 2;
          scoreGain += newValue;

          // Update merged tile
          tileMap.set(nextId, { ...nextTile, value: newValue, mergedFrom: true });
          mergedIds.add(nextId);

          // Remove current tile
          removedIds.add(id);
          grid[row][col] = null;
          moved = true;
          continue;
        }
      }
    }

    // Move to farthest position
    if (farthest.row !== row || farthest.col !== col) {
      grid[row][col] = null;
      grid[farthest.row][farthest.col] = id;
      tileMap.set(id, { ...tile, row: farthest.row, col: farthest.col });
      moved = true;
    }
  }

  const resultTiles = Array.from(tileMap.values()).filter(t => !removedIds.has(t.id));
  return { tiles: resultTiles, score: scoreGain, moved };
}

function getTraversals(direction: Direction): { row: number; col: number }[] {
  const positions: { row: number; col: number }[] = [];
  const rows = direction === 'down' ? [...Array(SIZE).keys()].reverse() : [...Array(SIZE).keys()];
  const cols = direction === 'right' ? [...Array(SIZE).keys()].reverse() : [...Array(SIZE).keys()];

  for (const row of rows) {
    for (const col of cols) {
      positions.push({ row, col });
    }
  }
  return positions;
}

function findFarthestPosition(
  grid: (number | null)[][],
  row: number,
  col: number,
  direction: Direction,
): { farthest: { row: number; col: number }; next: { row: number; col: number } | null } {
  const delta = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[direction];
  let prevRow = row;
  let prevCol = col;
  let nextRow = row + delta[0];
  let nextCol = col + delta[1];

  while (nextRow >= 0 && nextRow < SIZE && nextCol >= 0 && nextCol < SIZE && grid[nextRow][nextCol] === null) {
    prevRow = nextRow;
    prevCol = nextCol;
    nextRow += delta[0];
    nextCol += delta[1];
  }

  const next = nextRow >= 0 && nextRow < SIZE && nextCol >= 0 && nextCol < SIZE
    ? { row: nextRow, col: nextCol }
    : null;

  return { farthest: { row: prevRow, col: prevCol }, next };
}

function initState(): GameState {
  const grid = createEmptyGrid();
  let tiles: Tile[] = [];
  tiles = addRandomTile(tiles, grid);
  tiles = addRandomTile(tiles, grid);
  return { tiles, score: 0, gameOver: false, won: false, grid };
}

function reducer(state: GameState, action: Action): GameState {
  if (action.type === 'reset') return initState();

  if (state.gameOver) return state;

  const { tiles: movedTiles, score: scoreGain, moved } = moveTiles(state.tiles, action.direction);
  if (!moved) return state;

  const newGrid = buildGrid(movedTiles);
  const tilesWithNew = addRandomTile([...movedTiles], newGrid);
  const finalGrid = buildGrid(tilesWithNew);

  const won = state.won || tilesWithNew.some(t => t.value >= 2048);
  const gameOver = !canMove(tilesWithNew, finalGrid);

  return {
    tiles: tilesWithNew,
    score: state.score + scoreGain,
    gameOver,
    won,
    grid: finalGrid,
  };
}

export function use2048() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  const move = useCallback((direction: Direction) => {
    dispatch({ type: 'move', direction });
  }, []);

  const reset = useCallback(() => {
    nextId = 1;
    dispatch({ type: 'reset' });
  }, []);

  return { ...state, move, reset };
}
