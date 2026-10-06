import { NextRequest, NextResponse } from 'next/server';
import { deltaQuery } from '@/lib/contracts';
import { getDelta } from '@/db/queries';

export const dynamic = 'force-dynamic';

/** Инкрементальная догрузка среза по билду: только результаты с id > afterId. */
export async function GET(req: NextRequest) {
  const parsed = deltaQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные параметры', details: parsed.error.flatten() }, { status: 400 });
  }
  const { build, afterId } = parsed.data;
  const data = await getDelta(build, afterId);
  return NextResponse.json(data);
}
