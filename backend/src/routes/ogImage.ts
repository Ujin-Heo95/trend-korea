import type { FastifyInstance } from 'fastify';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { LRUCache } from '../cache/lru.js';

// 폰트는 시스템 폰트 대신 Google Fonts에서 가져옴
let fontData: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;
  const res = await fetch(
    'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&display=swap',
  );
  const css = await res.text();
  const fontUrl = css.match(/url\(([^)]+)\)/)?.[1];
  if (!fontUrl) throw new Error('Failed to extract font URL');
  const fontRes = await fetch(fontUrl);
  fontData = await fontRes.arrayBuffer();
  return fontData;
}

const ogCache = new LRUCache<Buffer>(50, 30 * 60_000); // 30분 TTL, 50 항목

export async function ogImageRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { postId: string } }>('/api/og-image/:postId', async (req, reply) => {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) return reply.status(400).send('Invalid ID');

    const cacheKey = `og:${postId}`;
    const cached = ogCache.get(cacheKey);
    if (cached) {
      return reply.type('image/png').header('cache-control', 'public, max-age=3600').send(cached);
    }

    const { rows } = await app.pg.query<{
      title: string; source_name: string; category: string | null;
    }>(
      `SELECT title, source_name, category FROM posts WHERE id = $1`,
      [postId],
    );
    if (!rows[0]) return reply.status(404).send('Not found');

    const { title, source_name, category } = rows[0];
    const font = await loadFont();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- satori accepts plain objects at runtime
    const element: any = {
      type: 'div',
      props: {
        style: {
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '60px',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          fontFamily: 'Noto Sans KR',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', gap: '16px' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', gap: '12px', alignItems: 'center' },
                    children: [
                      { type: 'span', props: { style: { fontSize: '16px', color: '#94a3b8', background: '#1e3a5f', padding: '4px 12px', borderRadius: '9999px' }, children: source_name } },
                      ...(category ? [{ type: 'span', props: { style: { fontSize: '16px', color: '#64748b' }, children: category } }] : []),
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { fontSize: title.length > 40 ? '36px' : '44px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 },
                    children: title.length > 80 ? title.slice(0, 80) + '…' : title,
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
              children: [
                { type: 'span', props: { style: { fontSize: '28px', fontWeight: 700, color: '#3b82f6' }, children: '위클릿' } },
                { type: 'span', props: { style: { fontSize: '16px', color: '#64748b' }, children: 'weeklit.net' } },
              ],
            },
          },
        ],
      },
    };

    const svg = await satori(element, {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Noto Sans KR', data: font, weight: 700, style: 'normal' }],
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const png = resvg.render().asPng();

    ogCache.set(cacheKey, Buffer.from(png));
    return reply
      .type('image/png')
      .header('cache-control', 'public, max-age=3600')
      .send(Buffer.from(png));
  });
}
