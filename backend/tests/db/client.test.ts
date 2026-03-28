import { describe, it, expect } from 'vitest';
import { pool } from '../../src/db/client.js';

describe('DB connection', () => {
  it('connects to PostgreSQL', async () => {
    const result = await pool.query('SELECT 1 AS value');
    expect(result.rows[0].value).toBe(1);
    await pool.end();
  });
});
