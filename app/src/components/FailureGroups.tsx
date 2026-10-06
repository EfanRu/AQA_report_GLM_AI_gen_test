import type { FailureGroup } from '@/lib/statuses';
import { CATEGORY_LABELS } from '@/lib/ui';

interface Props {
  groups: FailureGroup[];
  focusedKey: string | null;
  onFocus: (g: FailureGroup) => void;
  onResetFocus: () => void;
}

export default function FailureGroups({ groups, focusedKey, onFocus, onResetFocus }: Props) {
  if (groups.length === 0) return null;
  const totalFailed = groups.reduce((acc, g) => acc + g.count, 0);
  return (
    <div className="card">
      <h3>
        Причины падений ({totalFailed} упавших, {groups.length} групп){focusedKey && ' — фильтр по группе активен'}
      </h3>
      {focusedKey && (
        <div style={{ marginBottom: 8 }}>
          <button className="chip on" onClick={onResetFocus}>
            Показать все тесты ✕
          </button>
        </div>
      )}
      {groups.map((g) => (
        <div
          key={g.key}
          className="group"
          style={focusedKey === g.key ? { outline: '2px solid var(--accent)' } : undefined}
          onClick={() => onFocus(g)}
          title="Клик — показать тесты группы в таблице"
        >
          <div className="cnt" style={{ color: g.category ? undefined : 'var(--muted)' }}>
            {g.count}
          </div>
          <div className="gtext">
            {g.category ? (
              <>
                <span className={`cat-chip cat-${g.category}`}>{CATEGORY_LABELS[g.category]}</span>{' '}
                <span>{g.body}</span>
              </>
            ) : (
              <span style={{ color: 'var(--muted)' }}>{g.body}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
