import https from 'node:https';
import { logger } from '../utils/logger.js';

/**
 * api.kcisa.kr: 해외 DNS에서 해석 불가 → IP 직접 매핑.
 * DNS 동적 해석 시도 후, 실패 시 하드코딩 IP 사용.
 */

const KNOWN_IPS: Record<string, string> = {
  'api.kcisa.kr': '175.125.91.8',
};

let koreanDnsAvailable: boolean | null = null;

async function tryKoreanDns(hostname: string): Promise<string | null> {
  // 이미 실패 확인됐으면 스킵
  if (koreanDnsAvailable === false) return null;

  try {
    const { Resolver } = await import('node:dns/promises');
    const resolver = new Resolver();
    resolver.setServers(['168.126.63.1', '168.126.63.2']);

    const addresses = await Promise.race([
      resolver.resolve4(hostname),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);

    if (addresses.length > 0) {
      koreanDnsAvailable = true;
      logger.info({ hostname, ip: addresses[0] }, '[korean-dns] resolved via KT DNS');
      return addresses[0];
    }
  } catch {
    koreanDnsAvailable = false;
    logger.warn({ hostname }, '[korean-dns] KT DNS unreachable, using hardcoded IP');
  }

  return null;
}

/**
 * KCISA URL을 IP 기반으로 변환.
 * api.kcisa.kr → https://175.125.91.8/... + Host: api.kcisa.kr
 */
export async function resolveKcisaRequest(originalUrl: string): Promise<{
  url: string;
  headers: Record<string, string>;
  httpsAgent: https.Agent;
}> {
  const parsed = new URL(originalUrl);
  const hostname = parsed.hostname;

  // 1차: 동적 DNS 시도
  const dynamicIp = await tryKoreanDns(hostname);

  // 2차: 하드코딩 IP 폴백
  const ip = dynamicIp ?? KNOWN_IPS[hostname];

  if (!ip) {
    // 매핑 없는 도메인 → 원래 URL 그대로 반환
    return {
      url: originalUrl,
      headers: {},
      httpsAgent: new https.Agent({ rejectUnauthorized: true }),
    };
  }

  parsed.hostname = ip;

  return {
    url: parsed.toString(),
    headers: { Host: hostname },
    httpsAgent: new https.Agent({
      servername: hostname,
      rejectUnauthorized: true,
    }),
  };
}
