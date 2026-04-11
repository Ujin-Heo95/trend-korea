import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ──

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type TowerType = 'archer' | 'cannon' | 'ice';

export interface Tower {
  readonly id: number;
  readonly type: TowerType;
  readonly pos: Point;
  readonly level: number;
  readonly lastShot: number;
}

export interface Enemy {
  readonly id: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly x: number;
  readonly y: number;
  readonly pathIdx: number;
  readonly speed: number;
  readonly slowUntil: number;
}

export interface Projectile {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly targetId: number;
  readonly damage: number;
  readonly type: TowerType;
  readonly speed: number;
}

export interface TDState {
  readonly towers: readonly Tower[];
  readonly enemies: readonly Enemy[];
  readonly projectiles: readonly Projectile[];
  readonly wave: number;
  readonly gold: number;
  readonly lives: number;
  readonly score: number;
  readonly phase: 'idle' | 'playing' | 'between' | 'won' | 'lost';
  readonly selectedTower: TowerType | null;
}

// ── Constants ──

export const COLS = 20;
export const ROWS = 14;
export const CELL = 32;

const MAX_WAVES = 15;

// Path: zig-zag from left to right
export const PATH: readonly Point[] = buildPath();

function buildPath(): Point[] {
  const p: Point[] = [];
  // Row 2: left→right
  for (let x = 0; x < COLS; x++) p.push({ x, y: 2 });
  // Down to row 6
  for (let y = 3; y <= 6; y++) p.push({ x: COLS - 1, y });
  // Row 6: right→left
  for (let x = COLS - 2; x >= 0; x--) p.push({ x, y: 6 });
  // Down to row 10
  for (let y = 7; y <= 10; y++) p.push({ x: 0, y });
  // Row 10: left→right
  for (let x = 1; x < COLS; x++) p.push({ x, y: 10 });
  return p;
}

const PATH_SET = new Set(PATH.map(p => `${p.x},${p.y}`));
export function isPathCell(x: number, y: number): boolean {
  return PATH_SET.has(`${x},${y}`);
}

export const TOWER_DEFS: Record<TowerType, {
  cost: number;
  range: number;
  damage: number;
  cooldown: number;
  color: string;
  label: string;
  upgradeCost: number;
  sellRatio: number;
}> = {
  archer: { cost: 30, range: 3.5, damage: 8, cooldown: 500, color: '#22c55e', label: '아처', upgradeCost: 25, sellRatio: 0.6 },
  cannon: { cost: 60, range: 2.5, damage: 25, cooldown: 1200, color: '#ef4444', label: '캐논', upgradeCost: 50, sellRatio: 0.6 },
  ice: { cost: 40, range: 3, damage: 5, cooldown: 800, color: '#3b82f6', label: '아이스', upgradeCost: 30, sellRatio: 0.6 },
};

// ── Wave config ──

function waveConfig(wave: number): { count: number; hp: number; speed: number; reward: number } {
  const base = 20 + wave * 15;
  return {
    count: 5 + Math.floor(wave * 1.5),
    hp: base + Math.floor(wave * wave * 2),
    speed: 1.2 + wave * 0.08,
    reward: 5 + wave,
  };
}

// ── Hook ──

let nextId = 1;

export function useTowerDefense() {
  const [state, setState] = useState<TDState>({
    towers: [],
    enemies: [],
    projectiles: [],
    wave: 0,
    gold: 100,
    lives: 20,
    score: 0,
    phase: 'idle',
    selectedTower: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const spawnQueueRef = useRef<{ remaining: number; hp: number; speed: number; reward: number; interval: number; timer: number }>({
    remaining: 0, hp: 0, speed: 0, reward: 0, interval: 0, timer: 0,
  });

  const loopRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  // ── Actions ──

  const selectTower = useCallback((type: TowerType | null) => {
    setState(prev => ({ ...prev, selectedTower: type }));
  }, []);

  const placeTower = useCallback((cellX: number, cellY: number) => {
    setState(prev => {
      if (!prev.selectedTower) return prev;
      if (isPathCell(cellX, cellY)) return prev;
      if (cellX < 0 || cellX >= COLS || cellY < 0 || cellY >= ROWS) return prev;
      if (prev.towers.some(t => t.pos.x === cellX && t.pos.y === cellY)) return prev;

      const def = TOWER_DEFS[prev.selectedTower];
      if (prev.gold < def.cost) return prev;

      const tower: Tower = {
        id: nextId++,
        type: prev.selectedTower,
        pos: { x: cellX, y: cellY },
        level: 1,
        lastShot: 0,
      };

      return {
        ...prev,
        towers: [...prev.towers, tower],
        gold: prev.gold - def.cost,
      };
    });
  }, []);

  const sellTower = useCallback((towerId: number) => {
    setState(prev => {
      const tower = prev.towers.find(t => t.id === towerId);
      if (!tower) return prev;
      const def = TOWER_DEFS[tower.type];
      const refund = Math.floor(def.cost * def.sellRatio * tower.level);
      return {
        ...prev,
        towers: prev.towers.filter(t => t.id !== towerId),
        gold: prev.gold + refund,
      };
    });
  }, []);

  const startWave = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'idle' && prev.phase !== 'between') return prev;
      const nextWave = prev.wave + 1;
      if (nextWave > MAX_WAVES) return prev;
      const cfg = waveConfig(nextWave);
      spawnQueueRef.current = {
        remaining: cfg.count,
        hp: cfg.hp,
        speed: cfg.speed,
        reward: cfg.reward,
        interval: 800,
        timer: 0,
      };
      return { ...prev, wave: nextWave, phase: 'playing', enemies: [], projectiles: [] };
    });
  }, []);

  const reset = useCallback(() => {
    nextId = 1;
    spawnQueueRef.current = { remaining: 0, hp: 0, speed: 0, reward: 0, interval: 0, timer: 0 };
    setState({
      towers: [],
      enemies: [],
      projectiles: [],
      wave: 0,
      gold: 100,
      lives: 20,
      score: 0,
      phase: 'idle',
      selectedTower: null,
    });
  }, []);

  // ── Game loop ──

  useEffect(() => {
    if (state.phase !== 'playing') {
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
      return;
    }

    const tick = (time: number) => {
      const dt = lastTimeRef.current ? Math.min(time - lastTimeRef.current, 50) : 16;
      lastTimeRef.current = time;

      setState(prev => {
        if (prev.phase !== 'playing') return prev;

        let { enemies, projectiles, gold, lives, score } = {
          enemies: [...prev.enemies] as Enemy[],
          projectiles: [...prev.projectiles] as Projectile[],
          gold: prev.gold,
          lives: prev.lives,
          score: prev.score,
        };
        const towers = prev.towers;

        // 1. Spawn enemies
        const sq = spawnQueueRef.current;
        sq.timer += dt;
        if (sq.remaining > 0 && sq.timer >= sq.interval) {
          sq.timer = 0;
          sq.remaining--;
          const start = PATH[0];
          enemies.push({
            id: nextId++,
            hp: sq.hp,
            maxHp: sq.hp,
            x: start.x,
            y: start.y,
            pathIdx: 0,
            speed: sq.speed,
            slowUntil: 0,
          });
        }

        // 2. Move enemies
        const nowMs = time;
        const deadEnemyIds = new Set<number>();
        enemies = enemies.map(e => {
          const isSlow = e.slowUntil > nowMs;
          const spd = isSlow ? e.speed * 0.4 : e.speed;
          const moveAmt = (spd * dt) / 300;

          let pathIdx = e.pathIdx;
          let ex = e.x;
          let ey = e.y;
          let remaining = moveAmt;

          while (remaining > 0 && pathIdx < PATH.length - 1) {
            const target = PATH[pathIdx + 1];
            const dx = target.x - ex;
            const dy = target.y - ey;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= remaining) {
              ex = target.x;
              ey = target.y;
              pathIdx++;
              remaining -= dist;
            } else {
              ex += (dx / dist) * remaining;
              ey += (dy / dist) * remaining;
              remaining = 0;
            }
          }

          return { ...e, x: ex, y: ey, pathIdx };
        });

        // 3. Remove enemies that reached the end
        const survived: Enemy[] = [];
        for (const e of enemies) {
          if (e.pathIdx >= PATH.length - 1) {
            lives--;
          } else {
            survived.push(e);
          }
        }
        enemies = survived;

        // 4. Tower shooting
        const newProjectiles: Projectile[] = [];
        const updatedTowers = towers.map(t => {
          const def = TOWER_DEFS[t.type];
          const range = def.range + (t.level - 1) * 0.5;
          const dmg = Math.floor(def.damage * (1 + (t.level - 1) * 0.4));
          if (nowMs - t.lastShot < def.cooldown) return t;

          // Find closest enemy in range
          let closest: Enemy | null = null;
          let closestDist = Infinity;
          for (const e of enemies) {
            if (deadEnemyIds.has(e.id)) continue;
            const dx = e.x - t.pos.x;
            const dy = e.y - t.pos.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d <= range && d < closestDist) {
              closest = e;
              closestDist = d;
            }
          }

          if (closest) {
            newProjectiles.push({
              id: nextId++,
              x: t.pos.x,
              y: t.pos.y,
              targetId: closest.id,
              damage: dmg,
              type: t.type,
              speed: 8,
            });
            return { ...t, lastShot: nowMs };
          }
          return t;
        });

        projectiles = [...projectiles, ...newProjectiles];

        // 5. Move projectiles & hit
        const aliveProjectiles: Projectile[] = [];
        for (const p of projectiles) {
          const target = enemies.find(e => e.id === p.targetId);
          if (!target || deadEnemyIds.has(target.id)) continue;

          const dx = target.x - p.x;
          const dy = target.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const moveSpeed = (p.speed * dt) / 100;

          if (dist <= moveSpeed + 0.3) {
            // Hit
            const idx = enemies.indexOf(target);
            if (idx >= 0) {
              const newHp = target.hp - p.damage;
              if (newHp <= 0) {
                deadEnemyIds.add(target.id);
                gold += sq.reward;
                score += sq.reward;
                enemies.splice(idx, 1);
              } else {
                const slowUntil = p.type === 'ice' ? nowMs + 2000 : target.slowUntil;
                enemies[idx] = { ...target, hp: newHp, slowUntil };
              }
            }
          } else {
            aliveProjectiles.push({
              ...p,
              x: p.x + (dx / dist) * moveSpeed,
              y: p.y + (dy / dist) * moveSpeed,
            });
          }
        }

        // 6. Check win/lose
        let phase = prev.phase as TDState['phase'];
        if (lives <= 0) {
          phase = 'lost';
        } else if (sq.remaining <= 0 && enemies.length === 0) {
          if (prev.wave >= MAX_WAVES) {
            phase = 'won';
          } else {
            phase = 'between';
            gold += 20 + prev.wave * 5; // Wave clear bonus
          }
        }

        return {
          ...prev,
          towers: updatedTowers,
          enemies,
          projectiles: aliveProjectiles,
          gold,
          lives: Math.max(0, lives),
          score,
          phase,
        };
      });

      loopRef.current = requestAnimationFrame(tick);
    };

    lastTimeRef.current = 0;
    loopRef.current = requestAnimationFrame(tick);

    return () => {
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    };
  }, [state.phase]);

  return {
    ...state,
    selectTower,
    placeTower,
    sellTower,
    startWave,
    reset,
  };
}
