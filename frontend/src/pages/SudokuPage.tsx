import React from 'react';
import { SudokuGrid } from '../components/games/Sudoku/Grid';
import { useSudoku } from '../components/games/Sudoku/useSudoku';
import { GameLayout } from '../components/games/GameLayout';
import { getGameBySlug } from '../data/gamesSEO';

const GAME = getGameBySlug('sudoku')!;

export function SudokuPage() {
  const sudoku = useSudoku();

  return (
    <GameLayout game={GAME}>
      <SudokuGrid
        board={sudoku.board}
        selectedCell={sudoku.selectedCell}
        difficulty={sudoku.difficulty}
        completed={sudoku.completed}
        elapsedSeconds={sudoku.elapsedSeconds}
        mistakes={sudoku.mistakes}
        onSelect={sudoku.select}
        onInput={sudoku.input}
        onNote={sudoku.note}
        onErase={sudoku.erase}
        onReset={sudoku.reset}
        onTick={sudoku.tick}
      />
    </GameLayout>
  );
}
