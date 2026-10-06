import { NextRequest, NextResponse } from 'next/server';
import { missingQuery } from '@/lib/contracts';
import { getMissing } from '@/db/queries';

export const dynamic = 'force-dynamic';

/**
 * Тесты, отсутствующие в прогоне по сравнению с предыдущим (обрыв пайпа и т.п.).
 * Возвращает список для перезапуска.
 */
export async function GET(req: NextRequest) {
  const parsed = missingQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные параметры', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = await getMissing(parsed.data.runId, parsed.data.baselineRunId);
  if (!data) {
    return NextResponse.json({ error: 'Прогон не найден' }, { status: 404 });
  }
  return NextResponse.json(data);
}
