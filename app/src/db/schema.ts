import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Схема testreport.
 *
 * Писателем выступает листенер автотестов (CI и локальные запуски команды)
 * напрямую в БД: runs/results/test_defs — только INSERT (append-only).
 * Сервис отчётности читает эти таблицы и пишет исключительно в failure_comments.
 */
export const testreport = pgSchema('testreport');

export const testDefs = testreport.table(
  'test_defs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    className: text('class_name').notNull(),
    methodName: text('method_name').notNull(),
    /** sha256 канонического JSON параметров; '' для непараметризованных тестов */
    paramsHash: text('params_hash').notNull().default(''),
    paramsJson: jsonb('params_json').notNull().default(sql`'null'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('test_defs_key_uq').on(t.className, t.methodName, t.paramsHash)],
);

export const runs = testreport.table('runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** UUID, генерируется листенером на каждый запуск JVM/пайпа; защищает от дублей при ретраях */
  ciRunId: text('ci_run_id').notNull().unique(),
  buildVersion: text('build_version').notNull(),
  /** 'ci' | 'local' */
  source: text('source').notNull().default('ci'),
  branch: text('branch'),
  ciUrl: text('ci_url'),
  triggeredBy: text('triggered_by'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  /** null, пока прогон идёт — результаты дописываются по ходу выполнения */
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const results = testreport.table(
  'results',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id),
    testDefId: integer('test_def_id')
      .notNull()
      .references(() => testDefs.id),
    /** passed | failed | broken | skipped */
    status: text('status').notNull(),
    /** номер попытки внутри одного прогона (ретраи теста в рамках прогона) */
    attemptNo: integer('attempt_no').notNull().default(1),
    durationMs: integer('duration_ms'),
    errorMessage: text('error_message'),
    stackTrace: text('stack_trace'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('results_run_test_attempt_uq').on(t.runId, t.testDefId, t.attemptNo),
    index('results_test_def_idx').on(t.testDefId, t.startedAt),
    index('results_run_idx').on(t.runId),
  ],
);

export const failureComments = testreport.table(
  'failure_comments',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    testDefId: integer('test_def_id')
      .notNull()
      .references(() => testDefs.id),
    buildVersion: text('build_version').notNull(),
    /** product | auto | env | flaky | other */
    category: text('category').notNull(),
    body: text('body').notNull(),
    author: text('author').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('failure_comments_test_build_uq').on(t.testDefId, t.buildVersion)],
);
