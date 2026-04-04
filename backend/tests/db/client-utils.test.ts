import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock pg module to prevent actual DB connections
vi.mock('pg', () => {
  const mockQuery = vi.fn();
  const mockPool = {
    query: mockQuery,
    on: vi.fn(),
    end: vi.fn(),
  };
  return {
    Pool: vi.fn(() => mockPool),
    __mockQuery: mockQuery,
    __mockPool: mockPool,
  };
});

// Import after mock
import { pool, queryWithRetry, checkDbHealth } from '../../src/db/client.js';

// Get mock reference
const mockQuery = vi.fn();

describe('queryWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Replace pool.query with our controllable mock
    (pool as any).query = mockQuery;
  });

  it('returns result on successful query', async () => {
    const fakeResult = { rows: [{ value: 1 }], rowCount: 1 };
    mockQuery.mockResolvedValueOnce(fakeResult);

    const result = await queryWithRetry('SELECT 1 AS value');
    expect(result).toEqual(fakeResult);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('passes params to the query', async () => {
    const fakeResult = { rows: [], rowCount: 0 };
    mockQuery.mockResolvedValueOnce(fakeResult);

    await queryWithRetry('SELECT * FROM posts WHERE id = $1', [42]);
    expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM posts WHERE id = $1', [42]);
  });

  it('retries once on ECONNREFUSED connection error', async () => {
    const connError = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    const fakeResult = { rows: [{ value: 1 }], rowCount: 1 };
    mockQuery.mockRejectedValueOnce(connError).mockResolvedValueOnce(fakeResult);

    const result = await queryWithRetry('SELECT 1');
    expect(result).toEqual(fakeResult);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('retries once on ECONNRESET error', async () => {
    const connError = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    const fakeResult = { rows: [], rowCount: 0 };
    mockQuery.mockRejectedValueOnce(connError).mockResolvedValueOnce(fakeResult);

    const result = await queryWithRetry('SELECT 1');
    expect(result).toEqual(fakeResult);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('retries once on ETIMEDOUT error', async () => {
    const connError = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const fakeResult = { rows: [], rowCount: 0 };
    mockQuery.mockRejectedValueOnce(connError).mockResolvedValueOnce(fakeResult);

    const result = await queryWithRetry('SELECT 1');
    expect(result).toEqual(fakeResult);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('retries once on PostgreSQL admin_shutdown (57P01)', async () => {
    const connError = Object.assign(new Error('admin shutdown'), { code: '57P01' });
    const fakeResult = { rows: [], rowCount: 0 };
    mockQuery.mockRejectedValueOnce(connError).mockResolvedValueOnce(fakeResult);

    const result = await queryWithRetry('SELECT 1');
    expect(result).toEqual(fakeResult);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('retries once on PostgreSQL connection_failure (08006)', async () => {
    const connError = Object.assign(new Error('connection failure'), { code: '08006' });
    const fakeResult = { rows: [], rowCount: 0 };
    mockQuery.mockRejectedValueOnce(connError).mockResolvedValueOnce(fakeResult);

    const result = await queryWithRetry('SELECT 1');
    expect(result).toEqual(fakeResult);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-connection error (syntax error)', async () => {
    const syntaxError = Object.assign(new Error('syntax error'), { code: '42601' });
    mockQuery.mockRejectedValueOnce(syntaxError);

    await expect(queryWithRetry('INVALID SQL')).rejects.toThrow('syntax error');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('throws immediately when error has no code', async () => {
    const genericError = new Error('something went wrong');
    mockQuery.mockRejectedValueOnce(genericError);

    await expect(queryWithRetry('SELECT 1')).rejects.toThrow('something went wrong');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('throws if retry also fails', async () => {
    const err1 = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    const err2 = Object.assign(new Error('still refused'), { code: 'ECONNREFUSED' });
    mockQuery.mockRejectedValueOnce(err1).mockRejectedValueOnce(err2);

    await expect(queryWithRetry('SELECT 1')).rejects.toThrow('still refused');
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('does not retry for non-Error thrown values', async () => {
    mockQuery.mockRejectedValueOnce('string error');

    await expect(queryWithRetry('SELECT 1')).rejects.toBe('string error');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('checkDbHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (pool as any).query = mockQuery;
  });

  it('returns true when query succeeds', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const healthy = await checkDbHealth();
    expect(healthy).toBe(true);
  });

  it('returns false when query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection failed'));
    const healthy = await checkDbHealth();
    expect(healthy).toBe(false);
  });
});
