/** index.html 인라인 스크립트가 저장한 프리페치 promise를 1회 소비 */
export async function consumePrefetch<T>(key: string): Promise<T | undefined> {
  const store = (window as unknown as Record<string, unknown>).__PREFETCH__ as
    | Record<string, Promise<T | null>> | undefined;
  if (!store?.[key]) return undefined;
  const promise = store[key];
  delete store[key];
  try {
    const data = await promise;
    return data ?? undefined;
  } catch {
    return undefined;
  }
}
