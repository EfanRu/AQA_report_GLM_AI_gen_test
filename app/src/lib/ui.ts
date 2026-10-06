import type { Category, ResolvedStatus } from './statuses';

export const STATUS_LABELS: Record<ResolvedStatus, string> = {
  passed: 'Пройден',
  fixed: 'Починен',
  failed: 'Упал',
  broken: 'Ошибка',
  skipped: 'Пропущен',
};

export const STATUS_ORDER: ResolvedStatus[] = ['passed', 'fixed', 'failed', 'broken', 'skipped'];

export const CATEGORY_LABELS: Record<Category, string> = {
  product: 'Продукт',
  auto: 'Автотест',
  env: 'Окружение',
  flaky: 'Нестабильный',
  other: 'Другое',
};

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtMs(n: number | null): string {
  if (n == null) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)} с` : `${n} мс`;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}
