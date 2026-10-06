import { NextRequest, NextResponse } from 'next/server';
import { buildQuery } from '@/lib/contracts';
import { getReport } from '@/db/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const parsed = buildQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные параметры', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = await getReport(parsed.data.build);
  return NextResponse.json(data);
}
