import type { CompactResult, RawStatus, TestDefInfo } from './statuses';

export interface RunInfo {
  id: number;
  ciRunId: string;
  buildVersion: string;
  source: string;
  branch: string | null;
  ciUrl: string | null;
  triggeredBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  resultsCount: number;
}

export interface BuildInfo {
  buildVersion: string;
  runsCount: number;
  firstRunAt: string | null;
  lastRunAt: string | null;
}

export interface ReportResponse {
  build: string;
  runs: RunInfo[];
  results: CompactResult[];
  testDefs: Record<string, TestDefInfo>;
  maxResultId: number;
}

export interface DeltaResponse {
  maxResultId: number;
  results: CompactResult[];
  testDefs: Record<string, TestDefInfo>;
  runs: RunInfo[];
}

export interface AttemptItem {
  id: number;
  status: RawStatus;
  attemptNo: number;
  durationMs: number | null;
  errorMessage: string | null;
  stackTrace: string | null;
  startedAt: string;
  runId: number;
  source: string;
  branch: string | null;
  triggeredBy: string | null;
  ciUrl: string | null;
}

export interface MissingTest {
  id: number;
  className: string;
  methodName: string;
  params: unknown;
}

export interface MissingResponse {
  currentRun: RunInfo | null;
  baselineRun: RunInfo | null;
  missing: MissingTest[];
}
