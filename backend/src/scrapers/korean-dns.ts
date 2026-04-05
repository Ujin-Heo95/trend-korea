import { Resolver } from 'node:dns/promises';
import dns from 'node:dns';
import { Agent as HttpsAgent } from 'node:https';

/**
 * api.kcisa.kr 등 한국 정부 API 도메인은 해외 DNS에서 해석 불가.
 * KT 공용 DNS(168.126.63.1)를 사용하여 직접 해석.
 */

const KOREAN_DNS_SERVERS = ['168.126.63.1', '168.126.63.2'];
const KOREAN_DOMAINS = new Set(['api.kcisa.kr']);
const FALLBACK_IPS: Record<string, string> = {
  'api.kcisa.kr': '175.125.91.8',
};

// DNS 캐시 (10분 TTL)
const dnsCache = new Map<string, { ip: string; expiry: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

const resolver = new Resolver();
resolver.setServers(KOREAN_DNS_SERVERS);

async function resolveKoreanDomain(hostname: string): Promise<string> {
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiry > Date.now()) return cached.ip;

  try {
    const addresses = await resolver.resolve4(hostname);
    if (addresses.length > 0) {
      dnsCache.set(hostname, { ip: addresses[0], expiry: Date.now() + CACHE_TTL_MS });
      return addresses[0];
    }
  } catch {
    // Korean DNS 실패 → IP 폴백
  }

  const fallback = FALLBACK_IPS[hostname];
  if (fallback) {
    dnsCache.set(hostname, { ip: fallback, expiry: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  throw new Error(`[korean-dns] cannot resolve ${hostname}`);
}

/**
 * Node.js http.Agent lookup 호환 함수.
 * hostname, options, callback 형태 + hostname, callback 형태 모두 처리.
 */
function koreanLookup(
  hostname: string,
  optionsOrCallback: unknown,
  maybeCallback?: unknown,
): void {
  // 오버로드 해석: (hostname, callback) 또는 (hostname, options, callback)
  const cb = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as
    (err: NodeJS.ErrnoException | null, address: string, family: number) => void;

  if (!KOREAN_DOMAINS.has(hostname)) {
    // 한국 도메인이 아니면 시스템 기본 DNS
    const opts = typeof optionsOrCallback === 'function' ? { family: 4 } : (optionsOrCallback as dns.LookupOptions);
    dns.lookup(hostname, { ...opts, all: false }, cb as (err: NodeJS.ErrnoException | null, address: string, family: number) => void);
    return;
  }

  resolveKoreanDomain(hostname)
    .then(ip => cb(null, ip, 4))
    .catch(err => cb(err as NodeJS.ErrnoException, '', 4));
}

export const koreanDnsHttpsAgent = new HttpsAgent({
  lookup: koreanLookup as unknown as HttpsAgent['options']['lookup'],
  keepAlive: true,
});
