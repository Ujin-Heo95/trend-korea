import axios from 'axios';

// ─── Types ───

export interface ConfigGroupSummary {
  readonly groupName: string;
  readonly label: string;
  readonly description: string;
  readonly fieldCount: number;
}

export interface ConfigFieldValue {
  readonly key: string;
  readonly value: number | number[] | Record<string, number>;
  readonly defaultValue: number | number[] | Record<string, number>;
  readonly isCustom: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly label: string;
  readonly description?: string;
  readonly type: 'number' | 'record' | 'array';
}

export interface ConfigGroupDetail {
  readonly groupName: string;
  readonly label: string;
  readonly description: string;
  readonly fields: readonly ConfigFieldValue[];
}

// ─── API Functions ───

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export const fetchConfigGroups = (token: string): Promise<ConfigGroupSummary[]> =>
  axios.get('/api/admin/config', { headers: authHeaders(token) })
    .then(r => r.data.groups);

export const fetchConfigGroup = (token: string, group: string): Promise<ConfigGroupDetail> =>
  axios.get(`/api/admin/config/${group}`, { headers: authHeaders(token) })
    .then(r => r.data);

export const saveConfigGroup = (
  token: string,
  group: string,
  values: Record<string, unknown>,
): Promise<void> =>
  axios.put(`/api/admin/config/${group}`, { values }, { headers: authHeaders(token) })
    .then(() => undefined);

export const resetConfigGroup = (token: string, group: string): Promise<void> =>
  axios.post(`/api/admin/config/${group}/reset`, {}, { headers: authHeaders(token) })
    .then(() => undefined);
