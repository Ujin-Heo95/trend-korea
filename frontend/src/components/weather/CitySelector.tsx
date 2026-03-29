import React from 'react';

const CITIES = [
  { code: 'seoul',   name: '서울' },
  { code: 'busan',   name: '부산' },
  { code: 'daegu',   name: '대구' },
  { code: 'incheon', name: '인천' },
  { code: 'gwangju', name: '광주' },
  { code: 'daejeon', name: '대전' },
  { code: 'ulsan',   name: '울산' },
  { code: 'sejong',  name: '세종' },
  { code: 'jeju',    name: '제주' },
];

interface Props {
  selected: string;
  onChange: (code: string) => void;
}

export const CitySelector: React.FC<Props> = ({ selected, onChange }) => (
  <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
    {CITIES.map(({ code, name }) => (
      <button
        key={code}
        onClick={() => onChange(code)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
          selected === code
            ? 'bg-sky-600 text-white shadow-sm'
            : 'bg-white text-slate-600 border border-slate-200 hover:border-sky-300'
        }`}
      >
        {name}
      </button>
    ))}
  </div>
);
