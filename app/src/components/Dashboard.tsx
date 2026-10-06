'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildInfo, DeltaResponse, ReportResponse, RunInfo } from '@/lib/apiTypes';
import type {
  AggregatedRow,
  Category,
  CommentRow,
  CompactResult,
  FailureGroup,
  ResolvedStatus,
  TestDef,
  TestDefInfo,
} from '@/lib/statuses';
import { aggregate, countByStatus, groupFailures } from '@/lib/statuses';
import { fetchJson, putJson } from '@/lib/api';
import { clearCache, readCache, writeCache } from '@/lib/cache';
import { STATUS_LABELS, STATUS_ORDER, fmtTime } from '@/lib/ui';
import Counters from './Counters';
import RunsPanel from './RunsPanel';
import FailureGroups from './FailureGroups';
import ReportTable from './ReportTable';
import TestDrawer from './TestDrawer';
import MissingModal from './MissingModal';
import CommentForm, { type CommentInput } from './CommentForm';

function mergeResults(prev: CompactResult[], add: CompactResult[]): CompactResult[] {
  if (add.length === 0) return prev;
  const byId = new Map(prev.map((r) => [r.id, r]));
  for (const r of add) byId.set(r.id, r);
  return [...byId.values()];
}

export default function Dashboard() {
  const [builds, setBuilds] = useState<BuildInfo[]>([]);
  const [build, setBuild] = useState('');
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [results, setResults] = useState<CompactResult[]>([]);
  const [defs, setDefs] = useState<Record<string, TestDefInfo>>({});
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sync, setSync] = useState<{ at: number; added: number; mode: 'full' | 'delta' } | null>(null);
  const [author, setAuthor] = useState('');
  const [auto, setAuto] = useState(false);

  // фильтры
  const [statusFilter, setStatusFilter] = useState<Set<ResolvedStatus>>(new Set());
  const [search, setSearch] = useState('');
  const [errorSearch, setErrorSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [focusGroup, setFocusGroup] = useState<FailureGroup | null>(null);

  // ui-состояние
  const [openTest, setOpenTest] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [missingRunId, setMissingRunId] = useState<number | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);

  const reqRef = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem('tr_author');
    if (saved) setAuthor(saved);
  }, []);

  const onAuthorChange = (value: string) => {
    setAuthor(value);
    localStorage.setItem('tr_author', value);
  };

  const applyComments = (updated: CommentRow[]) => {
    setComments((prev) => {
      const byId = new Map(prev.map((c) => [c.testDefId, c]));
      for (const c of updated) byId.set(c.testDefId, c);
      return [...byId.values()];
    });
  };

  /**
   * Загрузка среза по билду. По умолчанию инкрементально: из localStorage берётся кеш
   * с курсором maxResultId, догружается только delta (результаты с большим id).
   * force=true — принудительная полная загрузка.
   */
  const loadScope = useCallback(
    async (opts: { force?: boolean } = {}) => {
      if (!build) return;
      const myReq = ++reqRef.current;
      setLoading(true);
      setLoadError(null);
      try {
        const cached = opts.force ? null : readCache(build);
        if (cached) {
          setResults(cached.results);
          setDefs(cached.testDefs);
          setRuns(cached.runs ?? []);
          const d = await fetchJson<DeltaResponse>(
            `/api/delta?build=${encodeURIComponent(build)}&afterId=${cached.maxResultId}`,
          );
          if (reqRef.current !== myReq) return;
          const mergedResults = mergeResults(cached.results, d.results);
          const mergedDefs = { ...cached.testDefs, ...d.testDefs };
          setResults(mergedResults);
          setDefs(mergedDefs);
          setRuns(d.runs);
          setSync({ at: Date.now(), added: d.results.length, mode: 'delta' });
          writeCache(build, {
            savedAt: Date.now(),
            maxResultId: d.maxResultId,
            results: mergedResults,
            testDefs: mergedDefs,
            runs: d.runs,
          });
        } else {
          const rep = await fetchJson<ReportResponse>(`/api/report?build=${encodeURIComponent(build)}`);
          if (reqRef.current !== myReq) return;
          setResults(rep.results);
          setDefs(rep.testDefs);
          setRuns(rep.runs);
          setSync({ at: Date.now(), added: rep.results.length, mode: 'full' });
          writeCache(build, {
            savedAt: Date.now(),
            maxResultId: rep.maxResultId,
            results: rep.results,
            testDefs: rep.testDefs,
            runs: rep.runs,
          });
        }
        const cm = await fetchJson<{ comments: CommentRow[] }>(
          `/api/comments?build=${encodeURIComponent(build)}`,
        );
        if (reqRef.current !== myReq) return;
        setComments(cm.comments);
      } catch (e) {
        if (reqRef.current === myReq) setLoadError(String(e));
      } finally {
        if (reqRef.current === myReq) setLoading(false);
      }
    },
    [build],
  );

  // первый вход: список билдов -> выбираем свежий -> грузим срез
  useEffect(() => {
    fetchJson<{ builds: BuildInfo[] }>('/api/builds')
      .then((r) => {
        setBuilds(r.builds);
        if (r.builds.length > 0) setBuild(r.builds[0].buildVersion);
      })
      .catch((e: unknown) => {
        setLoadError(String(e));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!build) return;
    setStatusFilter(new Set());
    setSearch('');
    setErrorSearch('');
    setTagFilter(new Set());
    setFocusGroup(null);
    setChecked(new Set());
    setOpenTest(null);
    void loadScope();
  }, [build, loadScope]);

  // автообновление: раз в 15 секунд догружаем delta (прогон идёт — отчёт живёт)
  useEffect(() => {
    if (!auto || !build) return;
    const t = setInterval(() => void loadScope(), 15_000);
    return () => clearInterval(t);
  }, [auto, build, loadScope]);

  const defMap = useMemo(() => {
    const m = new Map<number, TestDef>();
    for (const [k, v] of Object.entries(defs)) m.set(Number(k), { id: Number(k), ...v });
    return m;
  }, [defs]);

  const rows = useMemo(() => aggregate(results, defMap), [results, defMap]);
  const commentMap = useMemo(() => new Map(comments.map((c) => [c.testDefId, c])), [comments]);
  const groups = useMemo(() => groupFailures(rows, commentMap), [rows, commentMap]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const eq = errorSearch.trim().toLowerCase();
    const focusIds = focusGroup ? new Set(focusGroup.testDefIds) : null;
    return rows.filter((r) => {
      if (statusFilter.size > 0 && !statusFilter.has(r.resolvedStatus)) return false;
      if (q && !`${r.className}.${r.methodName} ${r.paramsText}`.toLowerCase().includes(q)) return false;
      if (eq && !(r.lastError ?? '').toLowerCase().includes(eq)) return false;
      if (tagFilter.size > 0) {
        const set = new Set(r.tags);
        for (const t of tagFilter) if (!set.has(t)) return false;
      }
      if (focusIds && !focusIds.has(r.testDefId)) return false;
      return true;
    });
  }, [rows, statusFilter, search, errorSearch, tagFilter, focusGroup]);

  const counters = useMemo(() => countByStatus(rows), [rows]);
  const openRow = useMemo(() => rows.find((r) => r.testDefId === openTest) ?? null, [rows, openTest]);
  const openComment = openTest != null ? commentMap.get(openTest) ?? null : null;

  const toggleStatus = (s: ResolvedStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleTag = (t: string) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const toggleCheck = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveComments = async (testDefIds: number[], value: CommentInput) => {
    if (!build || author.trim().length === 0) return;
    setCommentBusy(true);
    try {
      const r = await putJson<{ comments: CommentRow[] }>('/api/comments', {
        testDefIds,
        build,
        category: value.category,
        body: value.body,
        author: author.trim(),
      });
      applyComments(r.comments);
    } finally {
      setCommentBusy(false);
    }
  };

  const failedWithoutComment = groups.find((g) => g.key === '__no_comment__')?.count ?? 0;

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            Test<span>Report</span>
          </div>
          <select
            className="select"
            value={build}
            onChange={(e) => setBuild(e.target.value)}
            disabled={builds.length === 0}
          >
            {builds.length === 0 && <option value="">нет данных</option>}
            {builds.map((b) => (
              <option key={b.buildVersion} value={b.buildVersion}>
                билд {b.buildVersion} · прогонов: {b.runsCount}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ maxWidth: 150 }}
            placeholder="Ваше имя (автор)"
            value={author}
            onChange={(e) => onAuthorChange(e.target.value)}
            title="Используется как автор комментариев"
          />
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => void loadScope()} disabled={loading || !build}>
            Обновить
          </button>
          <button
            className="btn"
            onClick={() => {
              if (!build) return;
              clearCache(build);
              void loadScope({ force: true });
            }}
            disabled={loading || !build}
            title="Стереть локальный кеш и загрузить срез целиком"
          >
            Полная перезагрузка
          </button>
          <label className="sync" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> авто 15с
          </label>
          {sync && (
            <span className="sync" title={sync.mode === 'delta' ? 'Догружены только новые результаты' : 'Полная загрузка'}>
              {loading ? 'загрузка…' : `${sync.mode === 'delta' ? 'догружено' : 'загружено'} +${sync.added} · ${fmtTime(new Date(sync.at).toISOString())}`}
            </span>
          )}
        </div>
      </div>

      <div className="container">
        {loadError && (
          <div className="card error-text">
            Ошибка загрузки: {loadError}
            <div className="sync">
              Проверьте, что Postgres поднят (docker compose -f deploy/docker-compose.yml up -d), схема применена
              (npm run db:push) и демо-данные сгенерированы (npm run demo).
            </div>
          </div>
        )}

        {builds.length === 0 && !loadError && !loading && (
          <div className="empty">
            Нет данных. Выполните: <code>npm run db:push</code>, затем <code>npm run demo</code>
          </div>
        )}

        {builds.length > 0 && (
          <>
            <Counters rows={rows} active={statusFilter} onToggle={toggleStatus} />

            <RunsPanel runs={runs} onMissing={setMissingRunId} />

            <FailureGroups
              groups={groups}
              focusedKey={focusGroup?.key ?? null}
              onFocus={(g) => setFocusGroup((prev) => (prev?.key === g.key ? null : g))}
              onResetFocus={() => setFocusGroup(null)}
            />

            <div className="toolbar">
              <input
                className="input"
                placeholder="Поиск: класс или метод"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <input
                className="input"
                placeholder="Поиск по тексту ошибки"
                value={errorSearch}
                onChange={(e) => setErrorSearch(e.target.value)}
              />
              {STATUS_ORDER.map((s) => (
                <span
                  key={s}
                  className={`chip${statusFilter.has(s) ? ' on' : ''}`}
                  onClick={() => toggleStatus(s)}
                  style={{ color: statusFilter.has(s) ? '#fff' : `var(--${s})` }}
                >
                  {STATUS_LABELS[s]} ({counters[s]})
                </span>
              ))}
              <details className="tagbox">
                <summary className="chip" style={{ display: 'inline-block', listStyle: 'none' }}>
                  Теги {tagFilter.size > 0 ? `(${tagFilter.size})` : ''}
                </summary>
                <div>
                  {allTags.map(([t, n]) => (
                    <span
                      key={t}
                      className={`chip${tagFilter.has(t) ? ' on' : ''}`}
                      style={{ margin: 2, display: 'inline-block' }}
                      onClick={() => toggleTag(t)}
                    >
                      {t} ({n})
                    </span>
                  ))}
                </div>
              </details>
              {failedWithoutComment > 0 && (
                <span className="sync" title="Упавшие без комментария — сгруппированы в «Без комментария»">
                  без комментария: {failedWithoutComment}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <span className="sync">
                {filtered.length} из {rows.length} тестов
              </span>
            </div>

            <ReportTable rows={filtered} comments={commentMap} checked={checked} onCheck={toggleCheck} onOpen={setOpenTest} />
          </>
        )}
      </div>

      {openRow && (
        <TestDrawer
          row={openRow}
          build={build}
          comment={openComment}
          busy={commentBusy}
          onClose={() => setOpenTest(null)}
          onSubmitComment={(v) => void saveComments([openRow.testDefId], v)}
        />
      )}

      {missingRunId != null && <MissingModal runId={missingRunId} onClose={() => setMissingRunId(null)} />}

      {checked.size > 0 && (
        <div className="bulkbar">
          <b>Выбрано: {checked.size}</b>
          <button className="btn" onClick={() => setChecked(new Set())}>
            Снять выделение
          </button>
          <div style={{ minWidth: 340, flex: '0 1 420px' }}>
            <CommentForm
              initial={null}
              submitLabel={`Прокомментировать ${checked.size}`}
              busy={commentBusy}
              onSubmit={(v) => {
                void saveComments([...checked], v).then(() => setChecked(new Set()));
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
