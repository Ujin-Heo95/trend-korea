import React from 'react';
import type { Tile as TileData } from './use2048';

const COLORS: Record<number, { bg: string; text: string }> = {
  2:    { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-700 dark:text-slate-200' },
  4:    { bg: 'bg-slate-200 dark:bg-slate-600', text: 'text-slate-700 dark:text-slate-200' },
  8:    { bg: 'bg-orange-300 dark:bg-orange-700', text: 'text-white' },
  16:   { bg: 'bg-orange-400 dark:bg-orange-600', text: 'text-white' },
  32:   { bg: 'bg-orange-500 dark:bg-orange-500', text: 'text-white' },
  64:   { bg: 'bg-red-400 dark:bg-red-500', text: 'text-white' },
  128:  { bg: 'bg-yellow-400 dark:bg-yellow-500', text: 'text-white' },
  256:  { bg: 'bg-yellow-500 dark:bg-yellow-400', text: 'text-white' },
  512:  { bg: 'bg-yellow-500 dark:bg-yellow-300', text: 'text-slate-800' },
  1024: { bg: 'bg-yellow-600 dark:bg-yellow-300', text: 'text-slate-800' },
  2048: { bg: 'bg-yellow-400 dark:bg-yellow-200', text: 'text-slate-900' },
};

const DEFAULT_COLOR = { bg: 'bg-slate-800 dark:bg-slate-300', text: 'text-white dark:text-slate-900' };

interface TileProps {
  readonly tile: TileData;
  readonly cellSize: number;
  readonly gap: number;
}

export const TileComponent: React.FC<TileProps> = React.memo(({ tile, cellSize, gap }) => {
  const color = COLORS[tile.value] ?? DEFAULT_COLOR;
  const x = tile.col * (cellSize + gap) + gap;
  const y = tile.row * (cellSize + gap) + gap;
  const fontSize = tile.value >= 1024 ? 'text-lg' : tile.value >= 128 ? 'text-xl' : 'text-2xl';

  return (
    <div
      className={`absolute flex items-center justify-center rounded-md font-bold ${color.bg} ${color.text} ${fontSize} ${
        tile.isNew ? 'animate-[scaleIn_150ms_ease-out]' : ''
      } ${tile.mergedFrom ? 'animate-[pulse_200ms_ease-out]' : ''}`}
      style={{
        width: cellSize,
        height: cellSize,
        transform: `translate(${x}px, ${y}px)`,
        transition: 'transform 120ms ease-in-out',
        zIndex: tile.mergedFrom ? 2 : 1,
      }}
    >
      {tile.value}
    </div>
  );
});

TileComponent.displayName = 'Tile';
