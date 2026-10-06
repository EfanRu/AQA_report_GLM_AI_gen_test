import { NextRequest, NextResponse } from 'next/server';
import { attemptsQuery } from '@/lib/contracts';
import { getAttempts } from '@/db/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const parsed = attemptsQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные параметры', details: parsed.error.flatten() }, { status: 400 });
  }
  const { testDefId, build } = parsed.data;
  const attempts = await getAttempts(testDefId, build);
  return NextResponse.json({ attempts });
}
