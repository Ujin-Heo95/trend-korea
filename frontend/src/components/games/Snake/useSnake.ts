import { useCallback, useEffect, useRef, useState } from 'react';

export type Direction = 'up' | 'down' | 'left' | 'right';

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface SnakeState {
  readonly snake: readonly Point[];
  readonly food: Point;
  readonly direction: Direction;
  readonly score: number;
  readonly gameOver: boolean;
  readonly paused: boolean;
}

const GRID_SIZE = 20;
const INITIAL_SPEED = 150;
const MIN_SPEED = 60;
const SPEED_STEP = 3;

function randomFood(snake: readonly Point[]): Point {
  let food: Point;
  do {
    food = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (snake.some(s => s.x === food.x && s.y === food.y));
  return food;
}

function createInitialState(): SnakeState {
  const center = Math.floor(GRID_SIZE / 2);
  const snake: Point[] = [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center },
  ];
  return {
    snake,
    food: randomFood(snake),
    direction: 'right',
    score: 0,
    gameOver: false,
    paused: false,
  };
}

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down', down: 'up', left: 'right', right: 'left',
};

export function useSnake() {
  const [state, setState] = useState<SnakeState>(createInitialState);
  const directionRef = useRef<Direction>(state.direction);
  const nextDirectionRef = useRef<Direction | null>(null);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    const initial = createInitialState();
    directionRef.current = initial.direction;
    nextDirectionRef.current = null;
    setState(initial);
  }, []);

  const setDirection = useCallback((dir: Direction) => {
    if (OPPOSITE[dir] !== directionRef.current) {
      nextDirectionRef.current = dir;
    }
  }, []);

  const togglePause = useCallback(() => {
    setState(prev => (prev.gameOver ? prev : { ...prev, paused: !prev.paused }));
  }, []);

  // Game loop
  useEffect(() => {
    if (state.gameOver || state.paused) {
      if (loopRef.current) clearTimeout(loopRef.current);
      return;
    }

    const speed = Math.max(MIN_SPEED, INITIAL_SPEED - state.score * SPEED_STEP);

    loopRef.current = setTimeout(() => {
      setState(prev => {
        if (prev.gameOver || prev.paused) return prev;

        // Apply queued direction
        if (nextDirectionRef.current) {
          directionRef.current = nextDirectionRef.current;
          nextDirectionRef.current = null;
        }

        const dir = directionRef.current;
        const head = prev.snake[0];
        const delta = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[dir];
        const newHead: Point = { x: head.x + delta.x, y: head.y + delta.y };

        // Wall collision
        if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
          return { ...prev, gameOver: true };
        }

        // Self collision
        if (prev.snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
          return { ...prev, gameOver: true };
        }

        const ate = newHead.x === prev.food.x && newHead.y === prev.food.y;
        const newSnake = [newHead, ...prev.snake];
        if (!ate) newSnake.pop();

        return {
          ...prev,
          snake: newSnake,
          direction: dir,
          score: ate ? prev.score + 1 : prev.score,
          food: ate ? randomFood(newSnake) : prev.food,
        };
      });
    }, speed);

    return () => {
      if (loopRef.current) clearTimeout(loopRef.current);
    };
  }, [state.gameOver, state.paused, state.score, state.snake]);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right',
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        setDirection(dir);
      }
      if (e.key === ' ' || e.key === 'p') {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setDirection, togglePause]);

  return { ...state, gridSize: GRID_SIZE, setDirection, reset, togglePause };
}
