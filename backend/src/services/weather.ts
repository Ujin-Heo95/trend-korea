import { config } from '../config/index.js';
import { LRUCache } from '../cache/lru.js';

// ── 도시 좌표 ────────────────────────────────────────────
export const CITIES: Record<string, { name: string; nx: number; ny: number }> = {
  seoul:   { name: '서울',   nx: 60,  ny: 127 },
  busan:   { name: '부산',   nx: 98,  ny: 76  },
  daegu:   { name: '대구',   nx: 89,  ny: 90  },
  incheon: { name: '인천',   nx: 55,  ny: 124 },
  gwangju: { name: '광주',   nx: 58,  ny: 74  },
  daejeon: { name: '대전',   nx: 67,  ny: 100 },
  ulsan:   { name: '울산',   nx: 102, ny: 84  },
  sejong:  { name: '세종',   nx: 66,  ny: 103 },
  jeju:    { name: '제주',   nx: 52,  ny: 38  },
};

const BASE_TIMES = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'] as const;

// 3시간 TTL — 기상청 발표 주기와 일치
const cache = new LRUCache<WeatherResponse>(20, 3 * 60 * 60 * 1000);

// ── 타입 ─────────────────────────────────────────────────
interface RawItem {
  baseDate: string;
  baseTime: string;
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
  nx: number;
  ny: number;
}

export interface WeatherCurrent {
  temp: number;
  sky: number;
  pty: number;
  humidity: number;
  windSpeed: number;
  precipProb: number;
  precip: string;
}

export interface WeatherHourly {
  fcstDate: string;
  fcstTime: string;
  temp: number;
  sky: number;
  pty: number;
  precipProb: number;
  precip: string;
  snow: string;
  humidity: number;
  windSpeed: number;
}

export interface WeatherDaily {
  date: string;
  min: number | null;
  max: number | null;
}

export interface WeatherResponse {
  city: string;
  cityCode: string;
  baseDate: string;
  baseTime: string;
  current: WeatherCurrent;
  hourly: WeatherHourly[];
  daily: { today: WeatherDaily; tomorrow: WeatherDaily };
}

// ── base_time 계산 ───────────────────────────────────────
/** 현재 KST 기준 최신 발표 시각을 계산한다. 10분 버퍼 적용. */
export function getLatestBaseTime(now?: Date): { baseDate: string; baseTime: string } {
  const d = now ?? new Date();
  // KST = UTC + 9
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = kst.getUTCHours() * 100 + kst.getUTCMinutes();

  // 10분 버퍼: API는 발표 후 ~10분에 사용 가능
  const adjusted = hhmm - 10;

  let selectedTime: string | null = null;
  for (let i = BASE_TIMES.length - 1; i >= 0; i--) {
    if (adjusted >= Number(BASE_TIMES[i])) {
      selectedTime = BASE_TIMES[i];
      break;
    }
  }

  if (selectedTime) {
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const day = String(kst.getUTCDate()).padStart(2, '0');
    return { baseDate: `${y}${m}${day}`, baseTime: selectedTime };
  }

  // 자정~02:10 KST → 전일 2300 사용
  const prev = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  const y = prev.getUTCFullYear();
  const m = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const day = String(prev.getUTCDate()).padStart(2, '0');
  return { baseDate: `${y}${m}${day}`, baseTime: '2300' };
}

// ── API 호출 ─────────────────────────────────────────────
async function fetchFromKMA(cityCode: string, baseDate: string, baseTime: string): Promise<RawItem[]> {
  const city = CITIES[cityCode];
  if (!city) throw new Error(`Unknown city: ${cityCode}`);

  const params = new URLSearchParams({
    serviceKey: config.kmaApiKey,
    pageNo: '1',
    numOfRows: '1000',
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(city.nx),
    ny: String(city.ny),
  });

  const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

  if (!res.ok) {
    throw new Error(`KMA API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json() as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: RawItem[] } } } };
  const header = json?.response?.header;

  if (header?.resultCode !== '00') {
    throw new Error(`KMA API error: ${header?.resultCode} ${header?.resultMsg}`);
  }

  return json.response?.body?.items?.item ?? [];
}

// ── 데이터 변환 ──────────────────────────────────────────
function transformWeather(
  cityCode: string,
  items: RawItem[],
  baseDate: string,
  baseTime: string,
): WeatherResponse {
  const city = CITIES[cityCode];

  // 시간별로 그룹핑
  const byHour = new Map<string, Map<string, string>>();
  const tmnTmx: { tmn: Map<string, number>; tmx: Map<string, number> } = {
    tmn: new Map(),
    tmx: new Map(),
  };

  for (const item of items) {
    const key = `${item.fcstDate}:${item.fcstTime}`;
    if (!byHour.has(key)) byHour.set(key, new Map());
    byHour.get(key)!.set(item.category, item.fcstValue);

    // TMN/TMX는 특정 시간에만 나오므로 별도 수집
    if (item.category === 'TMN') tmnTmx.tmn.set(item.fcstDate, Number(item.fcstValue));
    if (item.category === 'TMX') tmnTmx.tmx.set(item.fcstDate, Number(item.fcstValue));
  }

  // 시간순 정렬
  const sortedKeys = [...byHour.keys()].sort();

  // hourly 배열 (최대 48시간)
  const hourly: WeatherHourly[] = sortedKeys.slice(0, 48).map(key => {
    const cats = byHour.get(key)!;
    const [fcstDate, fcstTime] = key.split(':');
    return {
      fcstDate,
      fcstTime,
      temp: Number(cats.get('TMP') ?? 0),
      sky: Number(cats.get('SKY') ?? 1),
      pty: Number(cats.get('PTY') ?? 0),
      precipProb: Number(cats.get('POP') ?? 0),
      precip: cats.get('PCP') ?? '강수없음',
      snow: cats.get('SNO') ?? '적설없음',
      humidity: Number(cats.get('REH') ?? 0),
      windSpeed: Number(cats.get('WSD') ?? 0),
    };
  });

  // current: 첫 번째 시간대
  const first = hourly[0];
  const current: WeatherCurrent = first
    ? {
        temp: first.temp,
        sky: first.sky,
        pty: first.pty,
        humidity: first.humidity,
        windSpeed: first.windSpeed,
        precipProb: first.precipProb,
        precip: first.precip,
      }
    : { temp: 0, sky: 1, pty: 0, humidity: 0, windSpeed: 0, precipProb: 0, precip: '강수없음' };

  // daily: 오늘/내일 최저/최고
  const todayStr = baseDate;
  // 내일 날짜 계산
  const todayDate = new Date(
    Number(todayStr.slice(0, 4)),
    Number(todayStr.slice(4, 6)) - 1,
    Number(todayStr.slice(6, 8)),
  );
  todayDate.setDate(todayDate.getDate() + 1);
  const tomorrowStr = `${todayDate.getFullYear()}${String(todayDate.getMonth() + 1).padStart(2, '0')}${String(todayDate.getDate()).padStart(2, '0')}`;

  const daily = {
    today: {
      date: todayStr,
      min: tmnTmx.tmn.get(todayStr) ?? null,
      max: tmnTmx.tmx.get(todayStr) ?? null,
    },
    tomorrow: {
      date: tomorrowStr,
      min: tmnTmx.tmn.get(tomorrowStr) ?? null,
      max: tmnTmx.tmx.get(tomorrowStr) ?? null,
    },
  };

  return { city: city.name, cityCode, baseDate, baseTime, current, hourly, daily };
}

// ── 메인 함수 ────────────────────────────────────────────
export async function getWeather(cityCode: string): Promise<WeatherResponse> {
  const { baseDate, baseTime } = getLatestBaseTime();
  const cacheKey = `weather:${cityCode}:${baseDate}:${baseTime}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const items = await fetchFromKMA(cityCode, baseDate, baseTime);
  const result = transformWeather(cityCode, items, baseDate, baseTime);
  cache.set(cacheKey, result);
  return result;
}
