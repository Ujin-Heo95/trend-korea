import { describe, it, expect } from 'vitest';
import { cosineSimVectors } from '../../src/services/embedding.js';

describe('cosineSimVectors', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimVectors(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimVectors(a, b)).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimVectors(a, b)).toBeCloseTo(-1);
  });

  it('returns correct similarity for arbitrary vectors', () => {
    const a = new Float32Array([1, 0, 1]);
    const b = new Float32Array([0, 1, 1]);
    // dot = 1, |a| = sqrt(2), |b| = sqrt(2), sim = 1/2 = 0.5
    expect(cosineSimVectors(a, b)).toBeCloseTo(0.5);
  });

  it('handles zero vectors', () => {
    const zero = new Float32Array([0, 0, 0]);
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimVectors(zero, v)).toBe(0);
    expect(cosineSimVectors(zero, zero)).toBe(0);
  });

  it('handles different-length vectors (returns 0)', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimVectors(a, b)).toBe(0);
  });
});
