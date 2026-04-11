import React, { useCallback, useEffect, useRef } from 'react';
import { TileComponent } from './Tile';
import type { Tile } from './use2048';

interface BoardProps {
  readonly tiles: readonly Tile[];
  readonly gameOver: boolean;
  readonly won: boolean;
  readonly onMove: (direction: 'up' | 'down' | 'left' | 'right') => void;
  readonly onReset: () => void;
}

const SIZE = 4;
const GAP = 8;
const CELL_SIZE_MOBILE = 68;
const CELL_SIZE_DESKTOP = 80;

function useCellSize() {
  const [cellSize, setCellSize] = React.useState(
    typeof window !== 'undefined' && window.innerWidth < 400 ? CELL_SIZE_MOBILE : CELL_SIZE_DESKTOP,
  );

  useEffect(() => {
    const handleResize = () => {
      setCellSize(window.innerWidth < 400 ? CELL_SIZE_MOBILE : CELL_SIZE_DESKTOP);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return cellSize;
}

export const Board: React.FC<BoardProps> = ({ tiles, gameOver, won, onMove, onReset }) => {
  const cellSize = useCellSize();
  const boardSize = SIZE * cellSize + (SIZE + 1) * GAP;
  const containerRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const map: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        onMove(dir);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onMove]);

  // Touch/swipe controls
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchRef.current.x;
    const dy = touch.clientY - touchRef.current.y;
    const minSwipe = 30;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > minSwipe) {
      onMove(dx > 0 ? 'right' : 'left');
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > minSwipe) {
      onMove(dy > 0 ? 'down' : 'up');
    }
    touchRef.current = null;
  }, [onMove]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={containerRef}
        className="relative rounded-lg bg-slate-300 dark:bg-slate-600 select-none touch-none"
        style={{ width: boardSize, height: boardSize }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Background grid cells */}
        {Array.from({ length: SIZE * SIZE }, (_, i) => {
          const row = Math.floor(i / SIZE);
          const col = i % SIZE;
          return (
            <div
              key={`bg-${i}`}
              className="absolute rounded-md bg-slate-200 dark:bg-slate-700"
              style={{
                width: cellSize,
                height: cellSize,
                left: col * (cellSize + GAP) + GAP,
                top: row * (cellSize + GAP) + GAP,
              }}
            />
          );
        })}

        {/* Tiles */}
        {tiles.map(tile => (
          <TileComponent key={tile.id} tile={tile} cellSize={cellSize} gap={GAP} />
        ))}

        {/* Game Over / Won overlay */}
        {(gameOver || won) && (
          <div className="absolute inset-0 rounded-lg bg-black/50 flex flex-col items-center justify-center gap-3 z-10">
            <p className="text-white text-xl font-bold">
              {won ? '🎉 2048 달성!' : '게임 오버'}
            </p>
            <button
              onClick={onReset}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              다시 시작
            </button>
          </div>
        )}
      </div>

      {/* Controls hint */}
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        화살표 키 또는 스와이프로 조작
      </p>
    </div>
  );
};
