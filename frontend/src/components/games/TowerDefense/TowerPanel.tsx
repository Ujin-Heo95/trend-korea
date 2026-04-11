import React from 'react';
import { type TowerType, TOWER_DEFS, type TDState } from './useTowerDefense';

interface TowerPanelProps {
  readonly gold: number;
  readonly selectedTower: TowerType | null;
  readonly phase: TDState['phase'];
  readonly wave: number;
  readonly lives: number;
  readonly onSelect: (type: TowerType | null) => void;
  readonly onStartWave: () => void;
  readonly onReset: () => void;
}

const TOWER_ORDER: TowerType[] = ['archer', 'cannon', 'ice'];

const EMOJI: Record<TowerType, string> = {
  archer: '🏹',
  cannon: '💣',
  ice: '❄️',
};

export function TowerPanel({
  gold,
  selectedTower,
  phase,
  wave,
  lives,
  onSelect,
  onStartWave,
  onReset,
}: TowerPanelProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm">
      {/* Status */}
      <div className="flex items-center gap-3 mr-auto">
        <span className="font-medium text-yellow-600 dark:text-yellow-400">
          💰 {gold}
        </span>
        <span className="text-red-500">
          ❤️ {lives}
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          Wave {wave}/15
        </span>
      </div>

      {/* Tower selection */}
      {TOWER_ORDER.map(type => {
        const def = TOWER_DEFS[type];
        const canAfford = gold >= def.cost;
        const isSelected = selectedTower === type;
        return (
          <button
            key={type}
            onClick={() => onSelect(isSelected ? null : type)}
            disabled={!canAfford}
            className={`
              px-2 py-1 rounded text-xs font-medium transition-colors border
              ${isSelected
                ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : canAfford
                  ? 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-300'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }
            `}
            title={`${def.label}: 데미지 ${def.damage}, 사거리 ${def.range}, 비용 ${def.cost}G`}
          >
            {EMOJI[type]} {def.label} ({def.cost}G)
          </button>
        );
      })}

      {/* Action buttons */}
      {(phase === 'idle' || phase === 'between') && (
        <button
          onClick={onStartWave}
          className="px-3 py-1 rounded text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition-colors"
        >
          {phase === 'idle' ? '시작' : '다음 웨이브'}
        </button>
      )}

      {(phase === 'won' || phase === 'lost') && (
        <button
          onClick={onReset}
          className="px-3 py-1 rounded text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          다시 하기
        </button>
      )}
    </div>
  );
}
