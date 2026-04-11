import React from 'react';
import type { Cell as CellData } from './useMinesweeper';

const NUMBER_COLORS: Record<number, string> = {
  1: 'text-blue-600 dark:text-blue-400',
  2: 'text-green-600 dark:text-green-400',
  3: 'text-red-600 dark:text-red-400',
  4: 'text-purple-700 dark:text-purple-400',
  5: 'text-red-800 dark:text-red-300',
  6: 'text-teal-600 dark:text-teal-400',
  7: 'text-slate-700 dark:text-slate-300',
  8: 'text-slate-500 dark:text-slate-400',
};

interface CellProps {
  readonly cell: CellData;
  readonly onClick: () => void;
  readonly onContextMenu: () => void;
  readonly gameOver: boolean;
}

export const CellComponent: React.FC<CellProps> = React.memo(({ cell, onClick, onContextMenu, gameOver }) => {
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu();
  };

  const handleLongPress = (() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return {
      onTouchStart: () => {
        timer = setTimeout(onContextMenu, 400);
      },
      onTouchEnd: () => {
        if (timer) { clearTimeout(timer); timer = null; }
      },
      onTouchMove: () => {
        if (timer) { clearTimeout(timer); timer = null; }
      },
    };
  })();

  if (cell.state === 'hidden') {
    return (
      <button
        type="button"
        onClick={onClick}
        onContextMenu={handleContextMenu}
        {...handleLongPress}
        className="w-full aspect-square rounded-sm bg-slate-300 dark:bg-slate-500 hover:bg-slate-400 dark:hover:bg-slate-400 active:bg-slate-400 transition-colors text-xs font-bold flex items-center justify-center select-none"
        aria-label="숨겨진 칸"
      />
    );
  }

  if (cell.state === 'flagged') {
    return (
      <button
        type="button"
        onClick={onClick}
        onContextMenu={handleContextMenu}
        {...handleLongPress}
        className="w-full aspect-square rounded-sm bg-slate-300 dark:bg-slate-500 flex items-center justify-center text-sm select-none"
        aria-label="깃발"
      >
        🚩
      </button>
    );
  }

  // Revealed
  if (cell.mine) {
    return (
      <div className={`w-full aspect-square rounded-sm flex items-center justify-center text-sm ${
        gameOver ? 'bg-red-200 dark:bg-red-900/50' : 'bg-slate-100 dark:bg-slate-700'
      }`}>
        💣
      </div>
    );
  }

  return (
    <div className="w-full aspect-square rounded-sm bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold select-none">
      {cell.adjacentMines > 0 && (
        <span className={NUMBER_COLORS[cell.adjacentMines] ?? 'text-slate-600'}>
          {cell.adjacentMines}
        </span>
      )}
    </div>
  );
});

CellComponent.displayName = 'Cell';
