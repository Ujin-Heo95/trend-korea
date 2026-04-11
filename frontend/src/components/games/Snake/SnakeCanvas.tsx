import React, { useRef, useEffect, useCallback } from 'react';
import type { SnakeState, Direction } from './useSnake';

interface SnakeCanvasProps {
  readonly state: SnakeState;
  readonly gridSize: number;
  readonly onDirection: (dir: Direction) => void;
  readonly onReset: () => void;
  readonly onTogglePause: () => void;
}

const CELL_PX = 16;

export const SnakeCanvas: React.FC<SnakeCanvasProps> = ({
  state, gridSize, onDirection, onReset, onTogglePause,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const size = gridSize * CELL_PX;

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isDark = document.documentElement.classList.contains('dark');

    // Background
    ctx.fillStyle = isDark ? '#1e293b' : '#f1f5f9';
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    ctx.strokeStyle = isDark ? '#334155' : '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_PX, 0);
      ctx.lineTo(i * CELL_PX, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_PX);
      ctx.lineTo(size, i * CELL_PX);
      ctx.stroke();
    }

    // Food
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(
      state.food.x * CELL_PX + CELL_PX / 2,
      state.food.y * CELL_PX + CELL_PX / 2,
      CELL_PX / 2 - 2,
      0, Math.PI * 2,
    );
    ctx.fill();

    // Snake
    state.snake.forEach((seg, i) => {
      const isHead = i === 0;
      ctx.fillStyle = isHead
        ? (isDark ? '#22d3ee' : '#0891b2')
        : (isDark ? '#06b6d4' : '#06b6d4');
      ctx.globalAlpha = isHead ? 1 : Math.max(0.4, 1 - i * 0.03);
      const padding = isHead ? 0 : 1;
      ctx.fillRect(
        seg.x * CELL_PX + padding,
        seg.y * CELL_PX + padding,
        CELL_PX - padding * 2,
        CELL_PX - padding * 2,
      );
    });
    ctx.globalAlpha = 1;
  }, [state.snake, state.food, gridSize, size]);

  // Touch swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dy = e.changedTouches[0].clientY - touchRef.current.y;
    const min = 20;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > min) {
      onDirection(dx > 0 ? 'right' : 'left');
    } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > min) {
      onDirection(dy > 0 ? 'down' : 'up');
    }
    touchRef.current = null;
  }, [onDirection]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="rounded-lg border border-slate-300 dark:border-slate-600 touch-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        />

        {/* Overlays */}
        {state.gameOver && (
          <div className="absolute inset-0 bg-black/50 rounded-lg flex flex-col items-center justify-center gap-3">
            <p className="text-white text-lg font-bold">게임 오버</p>
            <p className="text-white/80 text-sm">점수: {state.score}</p>
            <button
              onClick={onReset}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              다시 시작
            </button>
          </div>
        )}
        {state.paused && !state.gameOver && (
          <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
            <button
              onClick={onTogglePause}
              className="px-4 py-2 bg-white/90 text-slate-800 rounded-lg text-sm font-medium"
            >
              ▶ 계속하기
            </button>
          </div>
        )}
      </div>

      {/* Mobile controls */}
      <div className="grid grid-cols-3 gap-1 w-32 sm:hidden">
        <div />
        <button onClick={() => onDirection('up')} className="p-2 bg-slate-200 dark:bg-slate-700 rounded text-center text-sm">▲</button>
        <div />
        <button onClick={() => onDirection('left')} className="p-2 bg-slate-200 dark:bg-slate-700 rounded text-center text-sm">◀</button>
        <button onClick={onTogglePause} className="p-2 bg-slate-200 dark:bg-slate-700 rounded text-center text-xs">
          {state.paused ? '▶' : '⏸'}
        </button>
        <button onClick={() => onDirection('right')} className="p-2 bg-slate-200 dark:bg-slate-700 rounded text-center text-sm">▶</button>
        <div />
        <button onClick={() => onDirection('down')} className="p-2 bg-slate-200 dark:bg-slate-700 rounded text-center text-sm">▼</button>
        <div />
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        화살표 키 또는 스와이프 · Space로 일시정지
      </p>
    </div>
  );
};
