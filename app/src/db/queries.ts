import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from './client';
import { failureComments, results, runs, testDefs } from './schema';
import type { RawStatus, TestDefInfo } from '@/lib/statuses';
import type { RunInfo } from '@/lib/apiTypes';

function toRunInfo(r: typeof runs.$inferSelect, resultsCount: number): RunInfo {
  return {
    id: r.id,
    ciRunId: r.ciRunId,
    buildVersion: r.buildVersion,
    source: r.source,
    branch: r.branch,
    ciUrl: r.ciUrl,
    triggeredBy: r.triggeredBy,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    resultsCount,
  };
}

async function runCounts(runIds: number[]): Promise<Map<number, number>> {
  if (runIds.length === 0) return new Map();
  const rows = await db
    .select({ runId: results.runId, cnt: sql<number>`count(*)::int` })
    .from(results)
    .where(inArray(results.runId, runIds))
    .groupBy(results.runId);
  return new Map(rows.map((r) => [r.runId, r.cnt]));
}

const compactResultSelection = {
  id: results.id,
  runId: results.runId,
  testDefId: results.testDefId,
  status: results.status,
  attemptNo: results.attemptNo,
  durationMs: results.durationMs,
  errorMessage: results.errorMessage,
  startedAt: results.startedAt,
  tags: results.tags,
};

type CompactResultRow = {
  id: number;
  runId: number;
  testDefId: number;
  status: string;
  attemptNo: number;
  durationMs: number | null;
  errorMessage: string | null;
  startedAt: Date;
  tags: string[];
};

function toCompact(r: CompactResultRow) {
  return { ...r, status: r.status as RawStatus, startedAt: r.startedAt.toISOString() };
}

async function defsByIds(ids: number[]): Promise<Record<string, TestDefInfo>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({
      id: testDefs.id,
      className: testDefs.className,
      methodName: testDefs.methodName,
      paramsJson: testDefs.paramsJson,
    })
    .from(testDefs)
    .where(inArray(testDefs.id, ids));
  const defs: Record<string, TestDefInfo> = {};
  for (const d of rows) {
    defs[String(d.id)] = { className: d.className, methodName: d.methodName, params: d.paramsJson };
  }
  return defs;
}

export async function getBuilds() {
  const rows = await db
    .select({
      buildVersion: runs.buildVersion,
      runsCount: sql<number>`count(distinct ${runs.id})::int`,
      firstRunAt: sql<string | null>`min(${runs.startedAt})::text`,
      lastRunAt: sql<string | null>`max(${runs.startedAt})::text`,
    })
    .from(runs)
    .groupBy(runs.buildVersion)
    .orderBy(desc(sql`max(${runs.startedAt})`));
  return rows.map((r) => ({
    buildVersion: r.buildVersion,
    runsCount: r.runsCount,
    firstRunAt: r.firstRunAt,
    lastRunAt: r.lastRunAt,
  }));
}

export async function getRuns(limit = 100): Promise<RunInfo[]> {
  const rows = await db.select().from(runs).orderBy(desc(runs.startedAt)).limit(limit);
  const counts = await runCounts(rows.map((r) => r.id));
  return rows.map((r) => toRunInfo(r, counts.get(r.id) ?? 0));
}

/** Полный срез по билду: прогоны, компактные результаты, словарь тестов и курсор delta. */
export async function getReport(build: string) {
  const scopeRuns = await db
    .select()
    .from(runs)
    .where(eq(runs.buildVersion, build))
    .orderBy(asc(runs.startedAt));
  const ids = scopeRuns.map((r) => r.id);
  const counts = await runCounts(ids);
  const runInfos = scopeRuns.map((r) => toRunInfo(r, counts.get(r.id) ?? 0));
  if (ids.length === 0) {
    return { build, runs: [] as RunInfo[], results: [] as ReturnType<typeof toCompact>[], testDefs: {} as Record<string, TestDefInfo>, maxResultId: 0 };
  }
  const rows = await db
    .select(compactResultSelection)
    .from(results)
    .where(inArray(results.runId, ids))
    .orderBy(asc(results.id));
  const defIds = [...new Set(rows.map((r) => r.testDefId))];
  const defs = await defsByIds(defIds);
  return {
    build,
    runs: runInfos,
    results: rows.map(toCompact),
    testDefs: defs,
    maxResultId: rows.length ? rows[rows.length - 1].id : 0,
  };
}

/** Инкрементальная догрузка: только строки с id > afterId в рамках билда. */
export async function getDelta(build: string, afterId: number) {
  const scopeRuns = await db
    .select()
    .from(runs)
    .where(eq(runs.buildVersion, build))
    .orderBy(asc(runs.startedAt));
  const ids = scopeRuns.map((r) => r.id);
  const counts = await runCounts(ids);
  const runInfos = scopeRuns.map((r) => toRunInfo(r, counts.get(r.id) ?? 0));
  if (ids.length === 0) {
    return { maxResultId: 0, results: [] as ReturnType<typeof toCompact>[], testDefs: {} as Record<string, TestDefInfo>, runs: [] as RunInfo[] };
  }
  const rows = await db
    .select(compactResultSelection)
    .from(results)
    .where(and(inArray(results.runId, ids), gt(results.id, afterId)))
    .orderBy(asc(results.id));
  const [maxRow] = await db
    .select({ m: sql<number>`coalesce(max(${results.id}), 0)::int` })
    .from(results)
    .where(inArray(results.runId, ids));
  const defIds = [...new Set(rows.map((r) => r.testDefId))];
  const defs = await defsByIds(defIds);
  return {
    maxResultId: maxRow?.m ?? 0,
    results: rows.map(toCompact),
    testDefs: defs,
    runs: runInfos,
  };
}

export async function getAttempts(testDefId: number, build: string) {
  const rows = await db
    .select({
      id: results.id,
      status: results.status,
      attemptNo: results.attemptNo,
      durationMs: results.durationMs,
      errorMessage: results.errorMessage,
      stackTrace: results.stackTrace,
      startedAt: results.startedAt,
      runId: runs.id,
      source: runs.source,
      branch: runs.branch,
      triggeredBy: runs.triggeredBy,
      ciUrl: runs.ciUrl,
    })
    .from(results)
    .innerJoin(runs, eq(runs.id, results.runId))
    .where(and(eq(results.testDefId, testDefId), eq(runs.buildVersion, build)))
    .orderBy(asc(results.startedAt), asc(results.attemptNo));
  return rows.map((r) => ({ ...r, status: r.status as RawStatus, startedAt: r.startedAt.toISOString() }));
}

export async function getComments(build: string) {
  const rows = await db
    .select()
    .from(failureComments)
    .where(eq(failureComments.buildVersion, build));
  return rows.map((r) => ({
    testDefId: r.testDefId,
    category: r.category,
    body: r.body,
    author: r.author,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function putComments(input: {
  testDefIds: number[];
  build: string;
  category: string;
  body: string;
  author: string;
}) {
  const now = new Date();
  for (const testDefId of input.testDefIds) {
    await db
      .insert(failureComments)
      .values({
        testDefId,
        buildVersion: input.build,
        category: input.category,
        body: input.body,
        author: input.author,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [failureComments.testDefId, failureComments.buildVersion],
        set: { category: input.category, body: input.body, author: input.author, updatedAt: now },
      });
  }
  const updated = await db
    .select()
    .from(failureComments)
    .where(and(eq(failureComments.buildVersion, input.build), inArray(failureComments.testDefId, input.testDefIds)));
  return updated.map((r) => ({
    testDefId: r.testDefId,
    category: r.category,
    body: r.body,
    author: r.author,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * Тесты, отсутствующие в текущем прогоне по сравнению с предыдущим.
 * Базовый прогон по умолчанию: последний прогон того же билда, начавшийся раньше текущего;
 * если таких нет — последний прогон любого билда до текущего.
 */
export async function getMissing(runId: number, baselineRunId?: number) {
  const [current] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!current) return null;

  let baseline: typeof runs.$inferSelect | undefined;
  if (baselineRunId) {
    [baseline] = await db.select().from(runs).where(eq(runs.id, baselineRunId));
  }
  if (!baseline) {
    // Авто-база = «предыдущий отчёт»: среди прогонов, начавшихся раньше текущего,
    // берём прогон с наибольшим покрытием (distinct тестов); прогоны того же билда
    // приоритетны. Так обрыв пайпа сравнивается с последним ПОЛНЫМ прогоном, а не с рераном.
    const candidates = await db
      .select()
      .from(runs)
      .where(lt(runs.startedAt, current.startedAt))
      .orderBy(desc(runs.startedAt));
    if (candidates.length > 0) {
      const covRows = await db
        .select({ runId: results.runId, cnt: sql<number>`count(distinct ${results.testDefId})::int` })
        .from(results)
        .where(inArray(results.runId, candidates.map((c) => c.id)))
        .groupBy(results.runId);
      const coverage = new Map(covRows.map((c) => [c.runId, c.cnt]));
      const sameBuild = candidates.filter((c) => c.buildVersion === current.buildVersion);
      const pool = sameBuild.length > 0 ? sameBuild : candidates;
      baseline = pool.reduce((best, c) => {
        const bestCov = coverage.get(best.id) ?? 0;
        const cCov = coverage.get(c.id) ?? 0;
        return cCov > bestCov || (cCov === bestCov && c.startedAt > best.startedAt) ? c : best;
      }, pool[0]);
    }
  }
  if (!baseline || baseline.id === current.id) {
    const counts = await runCounts([current.id]);
    return {
      currentRun: toRunInfo(current, counts.get(current.id) ?? 0),
      baselineRun: null,
      missing: [] as { id: number; className: string; methodName: string; params: unknown }[],
    };
  }

  const cur = alias(results, 'cur');
  const rows = await db
    .select({
      id: testDefs.id,
      className: testDefs.className,
      methodName: testDefs.methodName,
      params: testDefs.paramsJson,
    })
    .from(results)
    .innerJoin(testDefs, eq(testDefs.id, results.testDefId))
    .leftJoin(cur, and(eq(cur.runId, current.id), eq(cur.testDefId, results.testDefId)))
    .where(and(eq(results.runId, baseline.id), isNull(cur.testDefId)))
    .orderBy(asc(testDefs.className), asc(testDefs.methodName));

  const counts = await runCounts([current.id, baseline.id]);
  return {
    currentRun: toRunInfo(current, counts.get(current.id) ?? 0),
    baselineRun: toRunInfo(baseline, counts.get(baseline.id) ?? 0),
    missing: rows,
  };
}

export async function ping() {
  await db.execute(sql`select 1`);
}
