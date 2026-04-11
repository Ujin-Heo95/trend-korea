import React, { useRef, useEffect, useCallback } from 'react';
import {
  COLS, ROWS, CELL, PATH, isPathCell,
  TOWER_DEFS,
  type Tower, type Enemy, type Projectile, type TowerType,
} from './useTowerDefense';

interface TDCanvasProps {
  readonly towers: readonly Tower[];
  readonly enemies: readonly Enemy[];
  readonly projectiles: readonly Projectile[];
  readonly selectedTower: TowerType | null;
  readonly phase: string;
  readonly onCellClick: (x: number, y: number) => void;
}

const W = COLS * CELL;
const H = ROWS * CELL;

export function TDCanvas({
  towers,
  enemies,
  projectiles,
  selectedTower,
  phase,
  onCellClick,
}: TDCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);

  // ── Draw ──

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, W, H);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, H);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(W, y * CELL);
      ctx.stroke();
    }

    // Path
    for (const p of PATH) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
    }

    // Path direction hints (subtle arrows)
    ctx.fillStyle = 'rgba(148,163,184,0.2)';
    for (let i = 0; i < PATH.length - 1; i += 3) {
      const cx = PATH[i].x * CELL + CELL / 2;
      const cy = PATH[i].y * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hover highlight
    const hover = hoverRef.current;
    if (hover && selectedTower && !isPathCell(hover.x, hover.y)) {
      const canPlace = !towers.some(t => t.pos.x === hover.x && t.pos.y === hover.y);
      ctx.fillStyle = canPlace ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)';
      ctx.fillRect(hover.x * CELL, hover.y * CELL, CELL, CELL);

      // Range preview
      if (canPlace) {
        const def = TOWER_DEFS[selectedTower];
        ctx.strokeStyle = 'rgba(34,197,94,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(
          hover.x * CELL + CELL / 2,
          hover.y * CELL + CELL / 2,
          def.range * CELL,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }

    // Towers
    for (const t of towers) {
      const def = TOWER_DEFS[t.type];
      const cx = t.pos.x * CELL + CELL / 2;
      const cy = t.pos.y * CELL + CELL / 2;

      // Base
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL / 2 - 4, 0, Math.PI * 2);
      ctx.fill();

      // Level indicator
      if (t.level > 1) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`★${t.level}`, cx, cy + 3);
      } else {
        // Tower icon
        ctx.fillStyle = 'white';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icons: Record<TowerType, string> = { archer: '🏹', cannon: '💣', ice: '❄️' };
        ctx.fillText(icons[t.type], cx, cy);
      }
    }

    // Enemies
    for (const e of enemies) {
      const ex = e.x * CELL + CELL / 2;
      const ey = e.y * CELL + CELL / 2;

      // HP bar background
      const barW = CELL - 6;
      const barH = 3;
      const barX = ex - barW / 2;
      const barY = ey - CELL / 2 + 2;
      ctx.fillStyle = '#374151';
      ctx.fillRect(barX, barY, barW, barH);

      // HP bar fill
      const ratio = e.hp / e.maxHp;
      ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(barX, barY, barW * ratio, barH);

      // Enemy body
      const isSlow = e.slowUntil > performance.now();
      ctx.fillStyle = isSlow ? '#93c5fd' : '#f97316';
      ctx.beginPath();
      ctx.arc(ex, ey + 2, CELL / 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Projectiles
    for (const p of projectiles) {
      const def = TOWER_DEFS[p.type];
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Overlay messages
    if (phase === 'won') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('승리! 🎉', W / 2, H / 2);
    } else if (phase === 'lost') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('게임 오버', W / 2, H / 2);
    } else if (phase === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('타워를 배치하고 시작하세요!', W / 2, H / 2);
    }
  }, [towers, enemies, projectiles, selectedTower, phase]);

  // ── Mouse handlers ──

  const getCell = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
      x: Math.floor((e.clientX - rect.left) * scaleX / CELL),
      y: Math.floor((e.clientY - rect.top) * scaleY / CELL),
    };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCell(e);
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
      onCellClick(x, y);
    }
  }, [getCell, onCellClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCell(e);
    hoverRef.current = (x >= 0 && x < COLS && y >= 0 && y < ROWS) ? { x, y } : null;
  }, [getCell]);

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = null;
  }, []);

  // Touch support
  const handleTouch = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const x = Math.floor((touch.clientX - rect.left) * scaleX / CELL);
    const y = Math.floor((touch.clientY - rect.top) * scaleY / CELL);
    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
      onCellClick(x, y);
    }
  }, [onCellClick]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouch}
      className="w-full max-w-[640px] mx-auto block rounded-lg border border-slate-700 cursor-crosshair touch-none"
      style={{ aspectRatio: `${COLS}/${ROWS}`, imageRendering: 'pixelated' }}
    />
  );
}
