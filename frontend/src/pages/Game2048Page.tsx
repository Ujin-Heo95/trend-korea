import React, { useEffect } from 'react';
import { Board } from '../components/games/Game2048/Board';
import { use2048 } from '../components/games/Game2048/use2048';
import { GameLayout } from '../components/games/GameLayout';
import { useGameScore } from '../hooks/useGameScore';
import { getGameBySlug } from '../data/gamesSEO';

const GAME = getGameBySlug('2048')!;

export function Game2048Page() {
  const { tiles, score, gameOver, won, move, reset } = use2048();
  const { bestScore, updateScore } = useGameScore('2048');

  useEffect(() => {
    updateScore(score);
  }, [score, updateScore]);

  return (
    <GameLayout game={GAME} score={score} bestScore={bestScore}>
      <Board
        tiles={tiles}
        gameOver={gameOver}
        won={won}
        onMove={move}
        onReset={reset}
      />
    </GameLayout>
  );
}
