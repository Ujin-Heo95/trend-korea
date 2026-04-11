import React from 'react';
import type { CellData } from './useSudoku';

interface CellProps {
  readonly cell: CellData;
  readonly row: number;
  readonly col: number;
  readonly selected: boolean;
  readonly highlighted: boolean;
  readonly onClick: () => void;
}

export const SudokuCell: React.FC<CellProps> = React.memo(({
  cell, row, col, selected, highlighted, onClick,
}) => {
  const borderR = (col + 1) % 3 === 0 && col < 8 ? 'border-r-2 border-r-slate-400 dark:border-r-slate-500' : '';
  const borderB = (row + 1) % 3 === 0 && row < 8 ? 'border-b-2 border-b-slate-400 dark:border-b-slate-500' : '';

  let bg = 'bg-white dark:bg-slate-800';
  if (selected) bg = 'bg-blue-100 dark:bg-blue-900/50';
  else if (highlighted) bg = 'bg-blue-50 dark:bg-blue-900/20';

  const textColor = cell.error
    ? 'text-red-600 dark:text-red-400'
    : cell.fixed
      ? 'text-slate-800 dark:text-slate-200 font-bold'
      : 'text-blue-600 dark:text-blue-400';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center justify-center border border-slate-200 dark:border-slate-700 ${borderR} ${borderB} ${bg} transition-colors text-sm select-none aspect-square`}
      style={{ minWidth: 32, minHeight: 32 }}
    >
      {cell.value > 0 ? (
        <span className={textColor}>{cell.value}</span>
      ) : cell.notes.length > 0 ? (
        <div className="grid grid-cols-3 gap-0 w-full h-full p-0.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <span
              key={n}
              className="text-[8px] leading-none text-center text-slate-400 dark:text-slate-500"
            >
              {cell.notes.includes(n) ? n : ''}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
});

SudokuCell.displayName = 'SudokuCell';
