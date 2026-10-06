'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MissingResponse, RunInfo } from '@/lib/apiTypes';
import { fetchJson } from '@/lib/api';
import { copyText, fmtDateTime } from '@/lib/ui';

interface Props {
  runId: number;
  onClose: () => void;
}

/** Тесты, которых нет в прогоне по сравнению с предыдущим: обрыв пайпа, частичный рерун и т.п. */
export default function MissingModal({ runId, onClose }: Props) {
  const [data, setData] = useState<MissingResponse | null>(null);
  const [allRuns, setAllRuns] = useState<RunInfo[]>([]);
  const [baselineRunId, setBaselineRunId] = useState<number | ''>('');
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ runs: RunInfo[] }>('/api/runs')
      .then((r) => setAllRuns(r.runs))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    const qs = baselineRunId === '' ? `runId=${runId}` : `runId=${runId}&baselineRunId=${baselineRunId}`;
    fetchJson<MissingResponse>(`/api/missing?${qs}`)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [runId, baselineRunId]);

  const baselineOptions = useMemo(() => {
    const current = data?.currentRun;
    return allRuns.filter((r) => r.id !== runId && (!current || r.startedAt <= current.startedAt));
  }, [allRuns, runId, data?.currentRun]);

  const fqmnList = useMemo(() => {
    if (!data) return '';
    return data.missing.map((m) => `${m.className}.${m.methodName}`).join('\n');
  }, [data]);

  const mavenLine = useMemo(() => {
    if (!data) return '';
    const classes = [...new Set(data.missing.map((m) => m.className))];
    return `-Dtest=${classes.join(',')}`;
  }, [data]);

  async function onCopy(text: string, tag: string) {
    await copyText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Тесты, отсутствующие в прогоне</b>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="error-text">{error}</div>}
          {!data && !error && <div className="sync">Загрузка…</div>}
          {data && (
            <>
              <div className="toolbar">
                <span className="lbl" style={{ margin: 0 }}>
                  Сравнить с:
                </span>
                <select
                  className="select"
                  value={baselineRunId === '' ? '' : baselineRunId}
                  onChange={(e) => setBaselineRunId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">
                    предыдущий (авто
                    {data.baselineRun ? `: #${data.baselineRun.id}` : ' — не найден'})
                  </option>
                  {baselineOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      #{r.id} · {r.buildVersion} · {r.source} · {fmtDateTime(r.startedAt)}
                    </option>
                  ))}
                </select>
                {data.currentRun && (
                  <span className="sync">
                    текущий: #{data.currentRun.id} · {data.currentRun.resultsCount} результ. · билд{' '}
                    {data.currentRun.buildVersion}
                  </span>
                )}
              </div>
              {data.baselineRun && (
                <div className="sync" style={{ marginBottom: 8 }}>
                  базовый: #{data.baselineRun.id} · {data.baselineRun.resultsCount} результ.
                </div>
              )}
              {data.missing.length === 0 ? (
                <div className="empty">Все тесты базового прогона присутствуют в текущем — перезапускать нечего.</div>
              ) : (
                <>
                  <div className="toolbar">
                    <b style={{ color: 'var(--failed)' }}>Отсутствуют: {data.missing.length}</b>
                    <span style={{ flex: 1 }} />
                    <button className="btn" onClick={() => onCopy(fqmnList, 'list')}>
                      {copied === 'list' ? 'Скопировано ✓' : 'Копировать список (Class.method)'}
                    </button>
                    <button className="btn" onClick={() => onCopy(mavenLine, 'maven')}>
                      {copied === 'maven' ? 'Скопировано ✓' : 'Копировать -Dtest=…'}
                    </button>
                  </div>
                  <div style={{ maxHeight: '46vh', overflow: 'auto' }}>
                    {data.missing.map((m) => (
                      <div className="missing-row mono" key={m.id}>
                        <span style={{ color: 'var(--muted)' }}>{m.className}.</span>
                        <span>{m.methodName}</span>
                        {m.params != null && (
                          <span className="sync">{JSON.stringify(m.params)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
