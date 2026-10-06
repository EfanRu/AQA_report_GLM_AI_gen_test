'use client';

import { useEffect, useState } from 'react';
import type { AttemptItem } from '@/lib/apiTypes';
import type { AggregatedRow, CommentRow } from '@/lib/statuses';
import { fetchJson } from '@/lib/api';
import { CATEGORY_LABELS, STATUS_LABELS, fmtDateTime, fmtMs } from '@/lib/ui';
import CommentForm, { type CommentInput } from './CommentForm';

interface Props {
  row: AggregatedRow;
  build: string;
  comment: CommentRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmitComment: (value: CommentInput) => void;
}

export default function TestDrawer({ row, build, comment, busy, onClose, onSubmitComment }: Props) {
  const [attempts, setAttempts] = useState<AttemptItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAttempts(null);
    setError(null);
    fetchJson<{ attempts: AttemptItem[] }>(
      `/api/attempts?testDefId=${row.testDefId}&build=${encodeURIComponent(build)}`,
    )
      .then((r) => {
        if (!cancelled) setAttempts(r.attempts);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [row.testDefId, build]);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div className="drawer-title mono">
            <span className="cls" style={{ color: 'var(--muted)' }}>
              {row.className}.
            </span>
            <b>{row.methodName}</b>
            {row.paramsText && <span style={{ color: 'var(--muted)' }}> [{row.paramsText}]</span>}
          </div>
          <span className={`badge badge-${row.resolvedStatus}`}>{STATUS_LABELS[row.resolvedStatus]}</span>
          <button className="btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="card">
          <h3>Сводка</h3>
          <div className="sync">
            Попыток в срезе: <b>{row.attempts}</b> · последний запуск: {fmtDateTime(row.lastRunAt)} · длительность:{' '}
            {fmtMs(row.lastDurationMs)}
          </div>
          {row.tags.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {row.tags.map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Комментарий о причине падения</h3>
          {comment && (
            <div className="comment-preview" style={{ marginBottom: 8 }}>
              <span className={`cat-chip cat-${comment.category}`}>{CATEGORY_LABELS[comment.category]}</span>{' '}
              <span className="sync">
                — {comment.author}, обновлён {fmtDateTime(comment.updatedAt)}
              </span>
              <div style={{ marginTop: 4 }}>{comment.body}</div>
            </div>
          )}
          <CommentForm initial={comment} submitLabel="Сохранить комментарий" busy={busy} onSubmit={onSubmitComment} />
        </div>

        <div className="card">
          <h3>Попытки</h3>
          {error && <div className="error-text">{error}</div>}
          {!attempts && !error && <div className="sync">Загрузка…</div>}
          {attempts?.map((a) => (
            <div className="attempt" key={a.id}>
              <div className="ahead">
                <span className={`badge badge-${a.status}`}>{STATUS_LABELS[a.status]}</span>
                <span className="sync">{fmtDateTime(a.startedAt)}</span>
                <span className="sync">· {fmtMs(a.durationMs)}</span>
                <span className={`src-badge src-${a.source}`}>{a.source === 'local' ? 'Локальный' : 'CI'}</span>
                <span className="sync mono">
                  прогон #{a.runId}
                  {a.branch ? ` · ${a.branch}` : ''}
                  {a.triggeredBy ? ` · ${a.triggeredBy}` : ''}
                </span>
              </div>
              {a.errorMessage && (
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <b style={{ color: 'var(--failed)' }}>Ошибка:</b> {a.errorMessage}
                </div>
              )}
              {a.stackTrace && (
                <details>
                  <summary className="sync">stack trace</summary>
                  <pre className="stack">{a.stackTrace}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
