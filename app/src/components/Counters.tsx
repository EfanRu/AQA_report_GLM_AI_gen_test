import type { AggregatedRow, ResolvedStatus } from '@/lib/statuses';
import { STATUS_LABELS, STATUS_ORDER } from '@/lib/ui';

interface Props {
  rows: AggregatedRow[];
  active: Set<ResolvedStatus>;
  onToggle: (s: ResolvedStatus) => void;
}

export default function Counters({ rows, active, onToggle }: Props) {
  const counters: Record<ResolvedStatus, number> = {
    passed: 0,
    fixed: 0,
    failed: 0,
    broken: 0,
    skipped: 0,
  };
  for (const r of rows) counters[r.resolvedStatus]++;
  const total = rows.length;

  return (
    <div className="counters">
      {STATUS_ORDER.map((s) => (
        <div
          key={s}
          className={`counter${active.has(s) ? ' active' : ''}`}
          onClick={() => onToggle(s)}
          title="Клик — фильтр по статусу"
        >
          <div className="num" style={{ color: `var(--${s})` }}>
            {counters[s]}
          </div>
          <div className="cap">
            {STATUS_LABELS[s]} · {total ? Math.round((counters[s] / total) * 100) : 0}%
          </div>
        </div>
      ))}
      <div className="counter" style={{ cursor: 'default' }}>
        <div className="num">{total}</div>
        <div className="cap">Всего тестов</div>
      </div>
    </div>
  );
}
