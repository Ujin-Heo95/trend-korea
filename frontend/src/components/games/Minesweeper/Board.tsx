import React, { useState } from 'react';
import { CellComponent } from './Cell';
import { DIFFICULTIES, type Difficulty, type Cell } from './useMinesweeper';

interface BoardProps {
  readonly board: readonly (readonly Cell[])[];
  readonly rows: number;
  readonly cols: number;
  readonly totalMines: number;
  readonly flagCount: number;
  readonly status: 'idle' | 'playing' | 'won' | 'lost';
  readonly elapsedSeconds: number;
  readonly onReveal: (row: number, col: number) => void;
  readonly onFlag: (row: number, col: number) => void;
  readonly onReset: (difficulty: Difficulty) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const MinesweeperBoard: React.FC<BoardProps> = ({
  board, rows, cols, totalMines, flagCount, status, elapsedSeconds,
  onReveal, onFlag, onReset,
}) => {
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  const gameOver = status === 'won' || status === 'lost';

  const handleDifficultyChange = (d: Difficulty) => {
    setDifficulty(d);
    onReset(d);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Difficulty selector */}
      <div className="flex gap-2">
        {DIFFICULTIES.map(d => (
          <button
            key={d.label}
            onClick={() => handleDifficultyChange(d)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              difficulty.label === d.label
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          💣 {totalMines - flagCount}
        </span>
        <button
          onClick={() => onReset(difficulty)}
          className="text-lg hover:scale-110 transition-transform"
          aria-label="다시 시작"
        >
          {status === 'won' ? '😎' : status === 'lost' ? '😵' : '🙂'}
        </button>
        <span className="text-slate-600 dark:text-slate-300 tabular-nums">
          ⏱ {formatTime(elapsedSeconds)}
        </span>
      </div>

      {/* Board */}
      <div
        className="inline-grid gap-[2px] bg-slate-400 dark:bg-slate-600 p-[2px] rounded overflow-x-auto max-w-full"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(24px, 32px))`,
          gridTemplateRows: `repeat(${rows}, minmax(24px, 32px))`,
        }}
      >
        {board.flatMap((row, r) =>
          row.map((cell, c) => (
            <CellComponent
              key={`${r}-${c}`}
              cell={cell}
              onClick={() => onReveal(r, c)}
              onContextMenu={() => onFlag(r, c)}
              gameOver={gameOver}
            />
          )),
        )}
      </div>

      {/* Game Over message */}
      {gameOver && (
        <div className={`text-sm font-medium ${status === 'won' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {status === 'won' ? `🎉 클리어! ${formatTime(elapsedSeconds)}` : '💥 지뢰를 밟았습니다!'}
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        클릭: 열기 · 우클릭/길게 누르기: 깃발
      </p>
    </div>
  );
};
