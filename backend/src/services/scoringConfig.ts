import type { Pool } from 'pg';
import { LRUCache } from '../cache/lru.js';
import {
  CONFIG_GROUPS,
  getGroupDefaults,
  getAllGroupNames,
  type ConfigGroup,
  type ConfigField,
} from './scoringConfigDefaults.js';

// ─── Types ───

export interface ConfigFieldValue {
  readonly key: string;
  readonly value: number | number[] | Record<string, number>;
  readonly defaultValue: number | number[] | Record<string, number>;
  readonly isCustom: boolean; // DB에서 오버라이드된 값인지
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly label: string;
  readonly description?: string;
  readonly type: string;
}

export interface ConfigGroupResponse {
  readonly groupName: string;
  readonly label: string;
  readonly description: string;
  readonly fields: readonly ConfigFieldValue[];
}

// ─── ScoringConfigProvider ───

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

export class ScoringConfigProvider {
  private readonly cache = new LRUCache<Record<string, unknown>>(20, CACHE_TTL_MS);
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /** 그룹 전체 설정 반환 (DB 오버라이드 + 코드 기본값 머지) */
  async getGroup(groupName: string): Promise<Record<string, unknown>> {
    const cached = this.cache.get(groupName);
    if (cached) return cached;

    const group = getGroupDefaults(groupName);
    if (!group) return {};

    // 기본값으로 초기화
    const result: Record<string, unknown> = {};
    for (const field of group.fields) {
      result[field.key] = field.defaultValue;
    }

    // DB 오버라이드 적용
    try {
      const { rows } = await this.pool.query<{ config_key: string; value_json: unknown }>(
        'SELECT config_key, value_json FROM scoring_config WHERE group_name = $1',
        [groupName],
      );
      for (const row of rows) {
        if (row.config_key in result) {
          result[row.config_key] = row.value_json;
        }
      }
    } catch (err) {
      console.warn(`[scoringConfig] DB read failed for ${groupName}, using defaults:`, err instanceof Error ? err.message : err);
    }

    this.cache.set(groupName, result);
    return result;
  }

  /** 단일 숫자 값 조회 (편의 메서드) */
  async getNumber(groupName: string, key: string, fallback: number): Promise<number> {
    const group = await this.getGroup(groupName);
    const val = group[key];
    return typeof val === 'number' ? val : fallback;
  }

  /** Record<string, number> 값 조회 (편의 메서드) */
  async getRecord(groupName: string, key: string): Promise<Record<string, number>> {
    const group = await this.getGroup(groupName);
    const val = group[key];
    return (typeof val === 'object' && val !== null && !Array.isArray(val))
      ? val as Record<string, number>
      : {};
  }

  /** 배열 값 조회 (편의 메서드) */
  async getArray(groupName: string, key: string): Promise<number[]> {
    const group = await this.getGroup(groupName);
    const val = group[key];
    return Array.isArray(val) ? val as number[] : [];
  }

  /** 어드민용: 그룹 상세 반환 (필드별 현재값 + 기본값 + 검증 규칙) */
  async getGroupDetail(groupName: string): Promise<ConfigGroupResponse | null> {
    const group = getGroupDefaults(groupName);
    if (!group) return null;

    // DB에서 오버라이드된 키 가져오기
    const dbOverrides = new Map<string, unknown>();
    try {
      const { rows } = await this.pool.query<{ config_key: string; value_json: unknown }>(
        'SELECT config_key, value_json FROM scoring_config WHERE group_name = $1',
        [groupName],
      );
      for (const row of rows) {
        dbOverrides.set(row.config_key, row.value_json);
      }
    } catch {
      // DB 실패 시 기본값만 반환
    }

    const fields: ConfigFieldValue[] = group.fields.map(field => {
      const dbVal = dbOverrides.get(field.key);
      return {
        key: field.key,
        value: dbVal !== undefined ? dbVal as typeof field.defaultValue : field.defaultValue,
        defaultValue: field.defaultValue,
        isCustom: dbVal !== undefined,
        min: field.min,
        max: field.max,
        step: field.step,
        label: field.label,
        description: field.description,
        type: field.type,
      };
    });

    return {
      groupName: group.groupName,
      label: group.label,
      description: group.description,
      fields,
    };
  }

  /** 어드민용: 전체 그룹 목록 (요약) */
  listGroups(): readonly { groupName: string; label: string; description: string; fieldCount: number }[] {
    return CONFIG_GROUPS.map(g => ({
      groupName: g.groupName,
      label: g.label,
      description: g.description,
      fieldCount: g.fields.length,
    }));
  }

  /** 어드민용: 그룹 값 저장 (부분 업데이트) */
  async saveGroup(groupName: string, values: Record<string, unknown>): Promise<string[]> {
    const group = getGroupDefaults(groupName);
    if (!group) throw new Error(`Unknown config group: ${groupName}`);

    const errors = validateValues(group, values);
    if (errors.length > 0) return errors;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(values)) {
        const field = group.fields.find(f => f.key === key);
        if (!field) continue;
        await client.query(
          `INSERT INTO scoring_config (group_name, config_key, value_json, updated_at, updated_by)
           VALUES ($1, $2, $3, NOW(), 'admin')
           ON CONFLICT (group_name, config_key) DO UPDATE SET
             value_json = $3, updated_at = NOW(), updated_by = 'admin'`,
          [groupName, key, JSON.stringify(value)],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    this.invalidateCache(groupName);
    return [];
  }

  /** 어드민용: 그룹 기본값으로 복원 */
  async resetGroup(groupName: string): Promise<void> {
    const group = getGroupDefaults(groupName);
    if (!group) throw new Error(`Unknown config group: ${groupName}`);

    await this.pool.query(
      'DELETE FROM scoring_config WHERE group_name = $1',
      [groupName],
    );
    this.invalidateCache(groupName);
  }

  /** 캐시 무효화 */
  invalidateCache(groupName?: string): void {
    if (groupName) {
      // LRU에는 delete가 없으므로 clear 후 재빌드 (그룹이 20개 이하이므로 OK)
      this.cache.clear();
    } else {
      this.cache.clear();
    }
  }
}

// ─── Validation ─��─

function validateValues(group: ConfigGroup, values: Record<string, unknown>): string[] {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    const field = group.fields.find(f => f.key === key);
    if (!field) {
      errors.push(`Unknown field: ${key}`);
      continue;
    }
    validateField(field, value, errors);
  }

  return errors;
}

function validateField(field: ConfigField, value: unknown, errors: string[]): void {
  if (field.type === 'number') {
    if (typeof value !== 'number' || !isFinite(value)) {
      errors.push(`${field.key}: 숫자여야 합니다`);
      return;
    }
    if (field.min !== undefined && value < field.min) {
      errors.push(`${field.key}: 최소 ${field.min} 이상이어야 합니다`);
    }
    if (field.max !== undefined && value > field.max) {
      errors.push(`${field.key}: 최대 ${field.max} 이하여야 합니다`);
    }
  } else if (field.type === 'record') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push(`${field.key}: 객체(Record)여야 합니다`);
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v !== 'number' || !isFinite(v)) {
        errors.push(`${field.key}.${k}: 숫자여야 합니다`);
        continue;
      }
      if (field.min !== undefined && v < field.min) {
        errors.push(`${field.key}.${k}: 최소 ${field.min} 이상`);
      }
      if (field.max !== undefined && v > field.max) {
        errors.push(`${field.key}.${k}: 최대 ${field.max} 이하`);
      }
    }
  } else if (field.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${field.key}: 배열이어야 합니다`);
      return;
    }
    for (let i = 0; i < (value as unknown[]).length; i++) {
      const v = (value as unknown[])[i];
      if (typeof v !== 'number' || !isFinite(v)) {
        errors.push(`${field.key}[${i}]: 숫자여야 합니다`);
        continue;
      }
      if (field.min !== undefined && v < field.min) {
        errors.push(`${field.key}[${i}]: 최소 ${field.min} 이상`);
      }
      if (field.max !== undefined && v > field.max) {
        errors.push(`${field.key}[${i}]: 최대 ${field.max} 이하`);
      }
    }
  }
}

// ─── Singleton ───

let _instance: ScoringConfigProvider | null = null;

export function initScoringConfig(pool: Pool): ScoringConfigProvider {
  _instance = new ScoringConfigProvider(pool);
  return _instance;
}

export function getScoringConfig(): ScoringConfigProvider {
  if (!_instance) throw new Error('ScoringConfigProvider not initialized — call initScoringConfig(pool) first');
  return _instance;
}
