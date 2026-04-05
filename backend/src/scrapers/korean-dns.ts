import { Resolver } from 'node:dns/promises';
import https from 'node:https';

/**
 * api.kcisa.kr 등 한국 정부 API 도메인은 해외 DNS에서 해석 불가.
 * KT 공용 DNS(168.126.63.1)로 직접 해석 후 IP 반환.
 *
 * 사용법: URL의 호스트를 IP로 치환 + Host 헤더 추가
 */

const KOREAN_DNS_SERVERS = ['168.126.63.1', '168.126.63.2'];
const FALLBACK_IPS: Record<string, string> = {
  'api.kcisa.kr': '175.125.91.8',
};

const dnsCache = new Map<string, { ip: string; expiry: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

const resolver = new Resolver();
resolver.setServers(KOREAN_DNS_SERVERS);

export async function resolveKoreanHost(hostname: string): Promise<string> {
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiry > Date.now()) return cached.ip;

  try {
    const addresses = await resolver.resolve4(hostname);
    if (addresses.length > 0) {
      dnsCache.set(hostname, { ip: addresses[0], expiry: Date.now() + CACHE_TTL_MS });
      return addresses[0];
    }
  } catch {
    // Korean DNS도 실패 → 폴백
  }

  const fallback = FALLBACK_IPS[hostname];
  if (fallback) {
    dnsCache.set(hostname, { ip: fallback, expiry: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  throw new Error(`[korean-dns] cannot resolve ${hostname}`);
}

/**
 * KCISA URL을 IP 기반으로 변환 + Host 헤더/TLS SNI 설정 반환.
 * api.kcisa.kr → https://175.125.91.8/... + Host: api.kcisa.kr
 */
export async function resolveKcisaRequest(url: string): Promise<{
  url: string;
  headers: Record<string, string>;
  httpsAgent: https.Agent;
}> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  const ip = await resolveKoreanHost(hostname);

  // IP로 URL 치환
  parsed.hostname = ip;
  const resolvedUrl = parsed.toString();

  // TLS SNI를 원래 호스트네임으로 설정 (인증서 검증용)
  const agent = new https.Agent({
    servername: hostname,
    rejectUnauthorized: true,
  });

  return {
    url: resolvedUrl,
    headers: { Host: hostname },
    httpsAgent: agent,
  };
}
