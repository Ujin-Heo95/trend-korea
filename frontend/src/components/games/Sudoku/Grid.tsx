import React, { useState, useEffect, useRef } from 'react';
import { SudokuCell } from './Cell';
import type { CellData, Difficulty } from './useSudoku';

interface GridProps {
  readonly board: readonly (readonly CellData[])[];
  readonly selectedCell: { row: number; col: number } | null;
  readonly difficulty: Difficulty;
  readonly completed: boolean;
  readonly elapsedSeconds: number;
  readonly mistakes: number;
  readonly onSelect: (row: number, col: number) => void;
  readonly onInput: (value: number) => void;
  readonly onNote: (value: number) => void;
  readonly onErase: () => void;
  readonly onReset: (difficulty: Difficulty) => void;
  readonly onTick: () => void;
}

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: '쉬움' },
  { value: 'medium', label: '보통' },
  { value: 'hard', label: '어려움' },
];

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const SudokuGrid: React.FC<GridProps> = ({
  board, selectedCell, difficulty, completed, elapsedSeconds, mistakes,
  onSelect, onInput, onNote, onErase, onReset, onTick,
}) => {
  const [noteMode, setNoteMode] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    if (!completed) {
      timerRef.current = setInterval(onTick, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [completed, onTick]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        noteMode ? onNote(num) : onInput(num);
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onErase();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [noteMode, onInput, onNote, onErase]);

  const selectedValue = selectedCell ? board[selectedCell.row][selectedCell.col].value : 0;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Difficulty */}
      <div className="flex gap-2">
        {DIFFICULTIES.map(d => (
          <button
            key={d.value}
            onClick={() => onReset(d.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              difficulty === d.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Status */}
      <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
        <span>⏱ {formatTime(elapsedSeconds)}</span>
        <span>❌ 실수: {mistakes}</span>
      </div>

      {/* Grid */}
      <div
        className="inline-grid border-2 border-slate-400 dark:border-slate-500 rounded"
        style={{ gridTemplateColumns: 'repeat(9, minmax(28px, 40px))' }}
      >
        {board.flatMap((row, r) =>
          row.map((cell, c) => (
            <SudokuCell
              key={`${r}-${c}`}
              cell={cell}
              row={r}
              col={c}
              selected={selectedCell?.row === r && selectedCell?.col === c}
              highlighted={
                !!(selectedCell && (selectedCell.row === r || selectedCell.col === c ||
                  (Math.floor(selectedCell.row / 3) === Math.floor(r / 3) &&
                   Math.floor(selectedCell.col / 3) === Math.floor(c / 3)))) ||
                (selectedValue > 0 && cell.value === selectedValue)
              }
              onClick={() => onSelect(r, c)}
            />
          )),
        )}
      </div>

      {/* Number pad */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <button
            key={n}
            onClick={() => noteMode ? onNote(n) : onInput(n)}
            className="w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          >
            {n}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={onErase}
          className="px-3 py-1.5 text-xs rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300"
        >
          지우기
        </button>
        <button
          onClick={() => setNoteMode(!noteMode)}
          className={`px-3 py-1.5 text-xs rounded transition-colors ${
            noteMode
              ? 'bg-blue-600 text-white'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
          }`}
        >
          메모 {noteMode ? 'ON' : 'OFF'}
        </button>
      </div>

      {completed && (
        <div className="text-sm font-medium text-green-600 dark:text-green-400">
          🎉 완성! {formatTime(elapsedSeconds)} · 실수 {mistakes}회
        </div>
      )}
    </div>
  );
};
