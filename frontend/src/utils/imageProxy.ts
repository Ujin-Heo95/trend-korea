/** Proxy thumbnails through weserv.nl for resizing + WebP conversion */
export function optimizedImage(url: string | undefined | null, width = 200): string | undefined {
  if (!url) return undefined;
  // Skip data: URLs and already-proxied URLs
  if (url.startsWith('data:') || url.includes('wsrv.nl')) return url;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp&q=80`;
}
