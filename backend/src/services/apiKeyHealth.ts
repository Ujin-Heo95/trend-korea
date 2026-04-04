import { config } from '../config/index.js';

export interface ApiKeyStatus {
  key: string;
  configured: boolean;
  valid: boolean | null;
  lastChecked: string | null;
  error?: string;
}

interface CachedResult {
  statuses: ApiKeyStatus[];
  checkedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간
let cached: CachedResult | null = null;

const API_DEFINITIONS: readonly {
  key: string;
  envValue: () => string;
  checkFn?: () => Promise<void>;
}[] = [
  {
    key: 'youtube',
    envValue: () => config.youtubeApiKey,
    checkFn: async () => {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=id&chart=mostPopular&maxResults=1&regionCode=KR&key=${config.youtubeApiKey}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    key: 'kopis',
    envValue: () => config.kopisApiKey,
    checkFn: async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const res = await fetch(
        `http://www.kopis.or.kr/openApi/restful/boxoffice?service=${config.kopisApiKey}&ststype=day&date=${today}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    key: 'kobis',
    envValue: () => config.kobisApiKey,
    checkFn: async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10).replace(/-/g, '');
      const res = await fetch(
        `https://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchDailyBoxOfficeList.json?key=${config.kobisApiKey}&targetDt=${yesterday}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    key: 'kmdb',
    envValue: () => config.kmdbApiKey,
    checkFn: async () => {
      const res = await fetch(
        `https://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp?collection=kmdb_new2&ServiceKey=${config.kmdbApiKey}&listCount=1`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    key: 'kma',
    envValue: () => config.kmaApiKey,
    // 설정 여부만 확인
  },
  {
    key: 'kakao_rest',
    envValue: () => config.kakaoRestApiKey,
    checkFn: async () => {
      const res = await fetch(
        'https://dapi.kakao.com/v2/search/web?query=test&size=1',
        {
          headers: { Authorization: `KakaoAK ${config.kakaoRestApiKey}` },
          signal: AbortSignal.timeout(10000),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    key: 'naver',
    envValue: () => config.naverClientId,
    // 설정 여부만 확인
  },
  {
    key: 'discord',
    envValue: () => config.discordWebhookUrl,
    // 설정 여부만 확인 (웹훅 호출 부작용 회피)
  },
  {
    key: 'sentry',
    envValue: () => config.sentryDsn,
    // 설정 여부만 확인
  },
];

export async function checkApiKeys(forceRefresh = false): Promise<ApiKeyStatus[]> {
  if (!forceRefresh && cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.statuses;
  }

  const statuses: ApiKeyStatus[] = await Promise.all(
    API_DEFINITIONS.map(async (def) => {
      const configured = def.envValue().length > 0;

      if (!configured) {
        return { key: def.key, configured, valid: null, lastChecked: null };
      }

      if (!def.checkFn) {
        return {
          key: def.key,
          configured,
          valid: null,
          lastChecked: new Date().toISOString(),
        };
      }

      try {
        await def.checkFn();
        return {
          key: def.key,
          configured,
          valid: true,
          lastChecked: new Date().toISOString(),
        };
      } catch (err) {
        return {
          key: def.key,
          configured,
          valid: false,
          lastChecked: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  cached = { statuses, checkedAt: Date.now() };
  return statuses;
}
