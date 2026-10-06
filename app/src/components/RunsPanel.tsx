import type { RunInfo } from '@/lib/apiTypes';
import { fmtDateTime } from '@/lib/ui';

interface Props {
  runs: RunInfo[];
  onMissing: (runId: number) => void;
}

export default function RunsPanel({ runs, onMissing }: Props) {
  if (runs.length === 0) return null;
  return (
    <div className="card">
      <h3>Прогоны билда ({runs.length})</h3>
      {runs.map((r) => (
        <div className="runrow" key={r.id}>
          <span className="rid mono">#{r.id}</span>
          <span className={`src-badge src-${r.source}`}>{r.source === 'local' ? 'Локальный' : 'CI'}</span>
          {r.branch && <span className="tag">{r.branch}</span>}
          {r.triggeredBy && <span className="tag">{r.triggeredBy}</span>}
          <span className="sync">старт {fmtDateTime(r.startedAt)}</span>
          <span className="sync">результатов: {r.resultsCount}</span>
          {r.finishedAt ? (
            <span className="tag">завершён {fmtDateTime(r.finishedAt)}</span>
          ) : (
            <span className="badge badge-fixed">выполняется</span>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => onMissing(r.id)} title="Тесты, которых нет в этом прогоне по сравнению с предыдущим">
            Отсутствуют…
          </button>
        </div>
      ))}
    </div>
  );
}
