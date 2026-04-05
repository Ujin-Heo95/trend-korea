import { Resolver } from 'node:dns/promises';
import { Agent as HttpsAgent } from 'node:https';
import { Agent as HttpAgent } from 'node:http';
import type { LookupFunction } from 'node:net';

/**
 * api.kcisa.kr 등 한국 정부 API 도메인은 해외 DNS에서 해석 불가.
 * KT 공용 DNS(168.126.63.1)를 사용하여 ���접 해석.
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
    // Korean DNS도 실패 시 하드코딩 IP 폴백
  }

  const fallback = FALLBACK_IPS[hostname];
  if (fallback) return fallback;

  throw new Error(`[korean-dns] cannot resolve ${hostname}`);
}

const koreanLookup: LookupFunction = (hostname, _options, callback) => {
  if (!KOREAN_DOMAINS.has(hostname)) {
    // 한국 도메인이 아니면 시스템 기본 DNS 사용
    import('node:dns').then(dns => {
      dns.lookup(hostname, callback as Parameters<typeof dns.lookup>[1]);
    });
    return;
  }

  resolveKoreanDomain(hostname)
    .then(ip => callback(null, ip, 4))
    .catch(err => callback(err as NodeJS.ErrnoException, '', 4));
};

export const koreanDnsHttpsAgent = new HttpsAgent({
  lookup: koreanLookup,
  keepAlive: true,
});

export const koreanDnsHttpAgent = new HttpAgent({
  lookup: koreanLookup,
  keepAlive: true,
});
