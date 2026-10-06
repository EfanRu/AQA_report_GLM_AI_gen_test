import type { RunInfo } from './apiTypes';
import type { CompactResult, TestDefInfo } from './statuses';

/**
 * Локальный кеш среза по билду: при повторном открытии догружаем только delta
 * от сохранённого курсора maxResultId. «Полная перезагрузка» игнорирует и стирает кеш.
 */
const PREFIX = 'tr_cache_v1:';
const MAX_LEN = 4_000_000;

export interface ScopeCache {
  savedAt: number;
  maxResultId: number;
  results: CompactResult[];
  testDefs: Record<string, TestDefInfo>;
  runs: RunInfo[];
}

export function readCache(build: string): ScopeCache | null {
  try {
    const raw = localStorage.getItem(PREFIX + build);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScopeCache;
    if (typeof parsed.maxResultId !== 'number' || !Array.isArray(parsed.results)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache(build: string, cache: ScopeCache): void {
  try {
    const raw = JSON.stringify(cache);
    if (raw.length > MAX_LEN) return; // не влезает — в следующий раз полная загрузка
    localStorage.setItem(PREFIX + build, raw);
  } catch {
    /* приватный режим и т.п. — кеш не критичен */
  }
}

export function clearCache(build: string): void {
  try {
    localStorage.removeItem(PREFIX + build);
  } catch {
    /* noop */
  }
}
