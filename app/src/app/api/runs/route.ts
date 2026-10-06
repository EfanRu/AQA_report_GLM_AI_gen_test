import { NextResponse } from 'next/server';
import { getRuns } from '@/db/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const runs = await getRuns();
  return NextResponse.json({ runs });
}
