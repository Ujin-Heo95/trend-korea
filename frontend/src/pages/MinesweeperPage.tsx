import React from 'react';
import { MinesweeperBoard } from '../components/games/Minesweeper/Board';
import { useMinesweeper } from '../components/games/Minesweeper/useMinesweeper';
import { GameLayout } from '../components/games/GameLayout';
import { useGameScore } from '../hooks/useGameScore';
import { getGameBySlug } from '../data/gamesSEO';

const GAME = getGameBySlug('minesweeper')!;

export function MinesweeperPage() {
  const game = useMinesweeper();
  const { bestScore, updateScore } = useGameScore('minesweeper');

  // Score = cleared cells (higher is better for best score tracking)
  React.useEffect(() => {
    if (game.status === 'won') {
      updateScore(game.revealedCount);
    }
  }, [game.status, game.revealedCount, updateScore]);

  return (
    <GameLayout game={GAME} bestScore={bestScore}>
      <MinesweeperBoard
        board={game.board}
        rows={game.rows}
        cols={game.cols}
        totalMines={game.totalMines}
        flagCount={game.flagCount}
        status={game.status}
        elapsedSeconds={game.elapsedSeconds}
        onReveal={game.reveal}
        onFlag={game.flag}
        onReset={game.reset}
      />
    </GameLayout>
  );
}
