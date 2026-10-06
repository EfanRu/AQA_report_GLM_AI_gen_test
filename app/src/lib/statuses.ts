/**
 * Общая (клиент + сервер) чистая логика агрегации статусов и группировки падений.
 * Исходные результаты неизменяемы: «починен» вычисляется при чтении.
 */

export type RawStatus = 'passed' | 'failed' | 'broken' | 'skipped';
export type ResolvedStatus = 'passed' | 'fixed' | 'failed' | 'broken' | 'skipped';
export type Category = 'product' | 'auto' | 'env' | 'flaky' | 'other';

export interface CompactResult {
  id: number;
  runId: number;
  testDefId: number;
  status: RawStatus;
  attemptNo: number;
  durationMs: number | null;
  errorMessage: string | null;
  startedAt: string;
  tags: string[];
}

export interface TestDef {
  id: number;
  className: string;
  methodName: string;
  params: unknown;
}

export interface TestDefInfo {
  className: string;
  methodName: string;
  params: unknown;
}

export interface CommentRow {
  testDefId: number;
  category: Category;
  body: string;
  author: string;
  updatedAt: string;
}

export interface AggregatedRow {
  testDefId: number;
  className: string;
  methodName: string;
  paramsText: string;
  resolvedStatus: ResolvedStatus;
  attempts: number;
  lastError: string | null;
  lastDurationMs: number | null;
  lastRunAt: string;
  tags: string[];
}

export interface FailureGroup {
  key: string;
  category: Category | null;
  body: string;
  count: number;
  testDefIds: number[];
}

export function paramsToText(params: unknown): string {
  if (params == null) return '';
  if (typeof params !== 'object') return String(params);
  const entries = Object.entries(params as Record<string, unknown>);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ');
}

/**
 * Правило статуса: последний запуск выигрывает.
 * Если тест когда-то падал в рамках среза, а последний запуск прошёл — «fixed».
 */
export function resolveStatus(attemptsSorted: CompactResult[]): ResolvedStatus {
  const last = attemptsSorted[attemptsSorted.length - 1];
  const everFailed = attemptsSorted.some((a) => a.status === 'failed' || a.status === 'broken');
  if (last.status === 'passed' && everFailed) return 'fixed';
  return last.status;
}

function compareResults(a: CompactResult, b: CompactResult): number {
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? -1 : 1;
  return a.attemptNo - b.attemptNo;
}

export function aggregate(results: CompactResult[], defs: Map<number, TestDef>): AggregatedRow[] {
  const byTest = new Map<number, CompactResult[]>();
  for (const r of results) {
    let arr = byTest.get(r.testDefId);
    if (!arr) {
      arr = [];
      byTest.set(r.testDefId, arr);
    }
    arr.push(r);
  }
  const rows: AggregatedRow[] = [];
  for (const [testDefId, attempts] of byTest) {
    attempts.sort(compareResults);
    const def = defs.get(testDefId);
    const last = attempts[attempts.length - 1];
    let lastError: string | null = null;
    for (let i = attempts.length - 1; i >= 0; i--) {
      if (attempts[i].errorMessage) {
        lastError = attempts[i].errorMessage as string;
        break;
      }
    }
    const tags = [...new Set(attempts.flatMap((a) => a.tags))].sort();
    rows.push({
      testDefId,
      className: def?.className ?? `#${testDefId}`,
      methodName: def?.methodName ?? '',
      paramsText: def ? paramsToText(def.params) : '',
      resolvedStatus: resolveStatus(attempts),
      attempts: attempts.length,
      lastError,
      lastDurationMs: last.durationMs,
      lastRunAt: last.startedAt,
      tags,
    });
  }
  rows.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.methodName.localeCompare(b.methodName) ||
      a.paramsText.localeCompare(b.paramsText),
  );
  return rows;
}

export function normalizeBody(body: string): string {
  return body.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Группировка причин падений: категория + нормализованный текст комментария. */
export function groupFailures(rows: AggregatedRow[], comments: Map<number, CommentRow>): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const row of rows) {
    if (row.resolvedStatus !== 'failed' && row.resolvedStatus !== 'broken') continue;
    const c = comments.get(row.testDefId);
    const key = c ? `${c.category}::${normalizeBody(c.body)}` : '__no_comment__';
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        category: c?.category ?? null,
        body: c?.body ?? 'Без комментария',
        count: 0,
        testDefIds: [],
      };
      groups.set(key, g);
    }
    g.count++;
    g.testDefIds.push(row.testDefId);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export function countByStatus(rows: AggregatedRow[]): Record<ResolvedStatus, number> {
  const counters: Record<ResolvedStatus, number> = { passed: 0, fixed: 0, failed: 0, broken: 0, skipped: 0 };
  for (const r of rows) counters[r.resolvedStatus]++;
  return counters;
}
