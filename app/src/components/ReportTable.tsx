'use client';

import { useState } from 'react';
import type { AggregatedRow, CommentRow } from '@/lib/statuses';
import { CATEGORY_LABELS, STATUS_LABELS, fmtDateTime, fmtMs } from '@/lib/ui';

interface Props {
  rows: AggregatedRow[];
  comments: Map<number, CommentRow>;
  checked: Set<number>;
  onCheck: (testDefId: number) => void;
  onOpen: (testDefId: number) => void;
}

const VIEW_H = 620;
const ROW_H = 38;
const OVERSCAN = 8;

/** Виртуализированная таблица: тысячи строк без пагинации, скролл — чистый CSS/JS. */
export default function ReportTable({ rows, comments, checked, onCheck, onOpen }: Props) {
  const [scrollTop, setScrollTop] = useState(0);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN);
  const visible = rows.slice(start, end);

  return (
    <div className="table-wrap">
      <div className="tbl-head">
        <div />
        <div>Статус</div>
        <div>Тест (клик — детали)</div>
        <div>Теги</div>
        <div>Поп.</div>
        <div>Длит.</div>
        <div>Комментарий</div>
        <div>Запуск</div>
      </div>
      <div
        className="tbl-scroll"
        style={{ height: VIEW_H }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {rows.length === 0 ? (
          <div className="empty">Ничего не найдено — ослабьте фильтры</div>
        ) : (
          <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${start * ROW_H}px)` }}>
              {visible.map((r) => {
                const c = comments.get(r.testDefId);
                return (
                  <div className={`row${checked.has(r.testDefId) ? ' checked' : ''}`} key={r.testDefId}>
                    <div className="cell">
                      <input
                        type="checkbox"
                        checked={checked.has(r.testDefId)}
                        onChange={() => onCheck(r.testDefId)}
                      />
                    </div>
                    <div className="cell">
                      <span className={`badge badge-${r.resolvedStatus}`}>{STATUS_LABELS[r.resolvedStatus]}</span>
                    </div>
                    <div
                      className="cell cell-test mono"
                      title={`${r.className}.${r.methodName}${r.lastError ? `\n${r.lastError}` : ''}`}
                      onClick={() => onOpen(r.testDefId)}
                    >
                      <span className="cls">{r.className}.</span>
                      <b>{r.methodName}</b>
                      {r.paramsText && <span className="cls"> [{r.paramsText}]</span>}
                    </div>
                    <div className="cell">
                      {r.tags.slice(0, 3).map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                      {r.tags.length > 3 && <span className="tag">+{r.tags.length - 3}</span>}
                    </div>
                    <div className="cell">{r.attempts}</div>
                    <div className="cell sync">{fmtMs(r.lastDurationMs)}</div>
                    <div className="cell">
                      {c ? (
                        <>
                          <span className={`cat-chip cat-${c.category}`}>{CATEGORY_LABELS[c.category]}</span>{' '}
                          <span className="sync">{c.body.length > 40 ? c.body.slice(0, 40) + '…' : c.body}</span>
                        </>
                      ) : (
                        <span className="sync">—</span>
                      )}
                    </div>
                    <div className="cell sync">{fmtDateTime(r.lastRunAt)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="tbl-foot sync">
        Показано {rows.length} тестов (позиции {rows.length === 0 ? 0 : start + 1}–{end})
      </div>
    </div>
  );
}
