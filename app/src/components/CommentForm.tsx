'use client';

import { useEffect, useState } from 'react';
import type { Category, CommentRow } from '@/lib/statuses';
import { CATEGORY_LABELS } from '@/lib/ui';

export interface CommentInput {
  category: Category;
  body: string;
}

interface Props {
  initial: CommentRow | null;
  submitLabel: string;
  busy: boolean;
  onSubmit: (value: CommentInput) => void;
}

const CATEGORIES: Category[] = ['product', 'auto', 'env', 'flaky', 'other'];

export default function CommentForm({ initial, submitLabel, busy, onSubmit }: Props) {
  const [category, setCategory] = useState<Category>(initial?.category ?? 'other');
  const [body, setBody] = useState(initial?.body ?? '');

  useEffect(() => {
    setCategory(initial?.category ?? 'other');
    setBody(initial?.body ?? '');
  }, [initial?.updatedAt, initial?.category, initial?.body]);

  return (
    <div>
      <label className="lbl">
        Категория
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value as Category)} style={{ marginLeft: 8 }}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <textarea
        className="textarea"
        placeholder="Причина падения: что случилось и что сделано"
        value={body}
        maxLength={4000}
        onChange={(e) => setBody(e.target.value)}
      />
      <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="btn btn-primary"
          disabled={busy || body.trim().length === 0}
          onClick={() => onSubmit({ category, body: body.trim() })}
        >
          {submitLabel}
        </button>
        {busy && <span className="sync">Сохранение…</span>}
      </div>
    </div>
  );
}
