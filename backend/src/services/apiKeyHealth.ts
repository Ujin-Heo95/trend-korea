import { config } from '../config/index.js';
import { notifyApiKeyFailure } from './discord.js';

/** URL 내 API 키 파라미터 마스킹 — 로그/Discord에 키 노출 방지 */
function maskApiKeyInMessage(msg: string): string {
  return msg.replace(/([?&](?:key|serviceKey|service|ServiceKey)=)[^&\s]+/gi, '$1***');
}

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
    key: 'data_go_kr',
    envValue: () => config.dataGoKrApiKey,
    checkFn: async () => {
      // 공공데이터포털 API 경량 테스트 (관광사진 1건)
      const res = await fetch(
        `https://apis.data.go.kr/B551011/PhotoGalleryService1/galleryList1?serviceKey=${config.dataGoKrApiKey}&numOfRows=1&MobileOS=ETC&MobileApp=weeklit&_type=json`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    key: 'kma',
    envValue: () => config.kmaApiKey,
    // 기상청 API는 부작용 회피 — 설정 여부만 확인
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
    checkFn: async () => {
      const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': config.naverClientId,
          'X-Naver-Client-Secret': config.naverClientSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: '2026-01-01',
          endDate: '2026-01-02',
          timeUnit: 'date',
          keywordGroups: [{ groupName: 'test', keywords: ['test'] }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
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
  {
    key: 'bigkinds',
    envValue: () => config.bigkindsApiKey,
    checkFn: async () => {
      const res = await fetch(
        `https://tools.kinds.or.kr/api/v2/issues/ranking?serviceKey=${config.bigkindsApiKey}&page=1&perPage=1`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
  },
  {
    key: 'gemini',
    envValue: () => config.geminiApiKey,
    checkFn: async () => {
      // Gemini API 경량 테스트 (모델 목록 조회 — 토큰 소비 없음)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
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
        const rawMsg = err instanceof Error ? err.message : String(err);
        const errorMsg = maskApiKeyInMessage(rawMsg);
        // 실패 시 Discord 알림 (1시간 쿨다운 내장)
        notifyApiKeyFailure(def.key, errorMsg).catch(() => {});
        return {
          key: def.key,
          configured,
          valid: false,
          lastChecked: new Date().toISOString(),
          error: errorMsg,
        };
      }
    })
  );

  cached = { statuses, checkedAt: Date.now() };
  return statuses;
}
