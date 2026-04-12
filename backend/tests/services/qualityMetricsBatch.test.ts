import { describe, it, expect } from 'vitest';
import {
  computeClusterMetrics,
  percentile,
  average,
  stddev,
} from '../../src/services/qualityMetricsBatch.js';

function metricMap(metrics: { name: string; value: number }[]): Map<string, number> {
  return new Map(metrics.map(m => [m.name, m.value]));
}

describe('percentile', () => {
  it('returns 0 for empty', () => {
    expect(percentile([], 0.5)).toBe(0);
  });
  it('returns p50', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });
  it('returns p95', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
  });
});

describe('average / stddev', () => {
  it('average of empty is 0', () => {
    expect(average([])).toBe(0);
  });
  it('average works', () => {
    expect(average([1, 2, 3, 4])).toBe(2.5);
  });
  it('stddev of single is 0', () => {
    expect(stddev([5])).toBe(0);
  });
});

describe('computeClusterMetrics', () => {
  it('returns zero cardinality for no members', () => {
    const m = metricMap(computeClusterMetrics([]));
    expect(m.get('cluster.cardinality_total')).toBe(0);
  });

  it('detects size_over_50 cluster (oneline session signal)', () => {
    // 1 cluster with 60 members → 1, 1 cluster with 5 → 0
    const big = Array.from({ length: 60 }, (_, i) => ({
      cluster_id: 1,
      post_id: i + 1,
      source_key: `src${i % 5}`,
      title: `t${i}`,
      embedding: null,
    }));
    const small = Array.from({ length: 5 }, (_, i) => ({
      cluster_id: 2,
      post_id: 100 + i,
      source_key: 'src',
      title: `t${i}`,
      embedding: null,
    }));
    const m = metricMap(computeClusterMetrics([...big, ...small]));
    expect(m.get('cluster.cardinality_total')).toBe(2);
    expect(m.get('cluster.size_over_50_count')).toBe(1);
    expect(m.get('cluster.size_max')).toBe(60);
  });

  it('singleton ratio reflects 1-member clusters', () => {
    // 3 singletons + 1 cluster of 4
    const members = [
      { cluster_id: 1, post_id: 1, source_key: 'a', title: 't', embedding: null },
      { cluster_id: 2, post_id: 2, source_key: 'a', title: 't', embedding: null },
      { cluster_id: 3, post_id: 3, source_key: 'a', title: 't', embedding: null },
      { cluster_id: 4, post_id: 4, source_key: 'a', title: 't', embedding: null },
      { cluster_id: 4, post_id: 5, source_key: 'b', title: 't', embedding: null },
      { cluster_id: 4, post_id: 6, source_key: 'c', title: 't', embedding: null },
      { cluster_id: 4, post_id: 7, source_key: 'd', title: 't', embedding: null },
    ];
    const m = metricMap(computeClusterMetrics(members));
    expect(m.get('cluster.cardinality_total')).toBe(4);
    expect(m.get('cluster.singleton_ratio')).toBeCloseTo(0.75, 5);
  });

  it('source_diversity_p50 reflects distinct sources per cluster', () => {
    const members = [
      // cluster 1: 3 distinct sources
      { cluster_id: 1, post_id: 1, source_key: 'a', title: 't', embedding: null },
      { cluster_id: 1, post_id: 2, source_key: 'b', title: 't', embedding: null },
      { cluster_id: 1, post_id: 3, source_key: 'c', title: 't', embedding: null },
      // cluster 2: 1 source
      { cluster_id: 2, post_id: 4, source_key: 'a', title: 't', embedding: null },
      { cluster_id: 2, post_id: 5, source_key: 'a', title: 't', embedding: null },
    ];
    const m = metricMap(computeClusterMetrics(members));
    // sorted: [1, 3], p50 idx = floor(2*0.5) = 1 → 3
    expect(m.get('cluster.source_diversity_p50')).toBe(3);
  });

  it('intra_cos_p50 from embeddings', () => {
    // 2 clusters, both with similar embeddings
    const members = [
      { cluster_id: 1, post_id: 1, source_key: 'a', title: 't', embedding: [1, 0, 0] },
      { cluster_id: 1, post_id: 2, source_key: 'b', title: 't', embedding: [1, 0, 0] },
      { cluster_id: 2, post_id: 3, source_key: 'a', title: 't', embedding: [0, 1, 0] },
      { cluster_id: 2, post_id: 4, source_key: 'b', title: 't', embedding: [0, 1, 0] },
    ];
    const m = metricMap(computeClusterMetrics(members));
    expect(m.get('cluster.intra_cos_p50')).toBeCloseTo(1.0, 5);
  });
});
