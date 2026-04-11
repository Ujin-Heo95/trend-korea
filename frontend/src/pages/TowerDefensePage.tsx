import React, { useEffect } from 'react';
import { TDCanvas } from '../components/games/TowerDefense/TDCanvas';
import { TowerPanel } from '../components/games/TowerDefense/TowerPanel';
import { useTowerDefense } from '../components/games/TowerDefense/useTowerDefense';
import { GameLayout } from '../components/games/GameLayout';
import { useGameScore } from '../hooks/useGameScore';
import { getGameBySlug } from '../data/gamesSEO';

const GAME = getGameBySlug('tower-defense')!;

export function TowerDefensePage() {
  const {
    towers, enemies, projectiles,
    wave, gold, lives, score, phase, selectedTower,
    selectTower, placeTower, sellTower, startWave, reset,
  } = useTowerDefense();
  const { bestScore, updateScore } = useGameScore('tower-defense');

  useEffect(() => {
    updateScore(score);
  }, [score, updateScore]);

  return (
    <GameLayout game={GAME} score={score} bestScore={bestScore}>
      <div className="space-y-2">
        <TowerPanel
          gold={gold}
          selectedTower={selectedTower}
          phase={phase}
          wave={wave}
          lives={lives}
          onSelect={selectTower}
          onStartWave={startWave}
          onReset={reset}
        />
        <TDCanvas
          towers={towers}
          enemies={enemies}
          projectiles={projectiles}
          selectedTower={selectedTower}
          phase={phase}
          onCellClick={placeTower}
        />
        {phase === 'between' && (
          <p className="text-center text-xs text-green-600 dark:text-green-400">
            웨이브 {wave} 클리어! 보너스 골드 지급됨
          </p>
        )}
      </div>
    </GameLayout>
  );
}
