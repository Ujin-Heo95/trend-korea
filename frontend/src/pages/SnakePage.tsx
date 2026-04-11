import React, { useEffect } from 'react';
import { SnakeCanvas } from '../components/games/Snake/SnakeCanvas';
import { useSnake } from '../components/games/Snake/useSnake';
import { GameLayout } from '../components/games/GameLayout';
import { useGameScore } from '../hooks/useGameScore';
import { getGameBySlug } from '../data/gamesSEO';

const GAME = getGameBySlug('snake')!;

export function SnakePage() {
  const snake = useSnake();
  const { bestScore, updateScore } = useGameScore('snake');

  useEffect(() => {
    updateScore(snake.score);
  }, [snake.score, updateScore]);

  return (
    <GameLayout game={GAME} score={snake.score} bestScore={bestScore}>
      <SnakeCanvas
        state={snake}
        gridSize={snake.gridSize}
        onDirection={snake.setDirection}
        onReset={snake.reset}
        onTogglePause={snake.togglePause}
      />
    </GameLayout>
  );
}
