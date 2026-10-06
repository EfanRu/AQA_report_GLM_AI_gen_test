import { NextRequest, NextResponse } from 'next/server';
import { buildQuery, commentPut } from '@/lib/contracts';
import { getComments, putComments } from '@/db/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const parsed = buildQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные параметры', details: parsed.error.flatten() }, { status: 400 });
  }
  const comments = await getComments(parsed.data.build);
  return NextResponse.json({ comments });
}

/** Единственная точка записи сервиса: upsert комментариев (одного или списка тестов). */
export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ожидается JSON' }, { status: 400 });
  }
  const parsed = commentPut.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректное тело запроса', details: parsed.error.flatten() }, { status: 400 });
  }
  const comments = await putComments(parsed.data);
  return NextResponse.json({ comments });
}
