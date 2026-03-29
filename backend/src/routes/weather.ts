import type { FastifyInstance } from 'fastify';
import { CITIES, getWeather } from '../services/weather.js';

export async function weatherRoutes(app: FastifyInstance): Promise<void> {
  // 지원 도시 목록
  app.get('/api/weather/cities', async () => {
    return Object.entries(CITIES).map(([code, { name }]) => ({ code, name }));
  });

  // 특정 도시 날씨
  app.get<{ Params: { cityCode: string } }>(
    '/api/weather/:cityCode',
    async (req, reply) => {
      const { cityCode } = req.params;

      if (!CITIES[cityCode]) {
        return reply.status(400).send({ error: `Unknown city code: ${cityCode}` });
      }

      try {
        const data = await getWeather(cityCode);
        return data;
      } catch (err) {
        app.log.error(err, `[weather] Failed to fetch weather for ${cityCode}`);
        return reply.status(503).send({
          error: '날씨 정보를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.',
        });
      }
    },
  );
}
