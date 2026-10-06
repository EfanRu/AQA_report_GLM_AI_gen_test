import { NextRequest, NextResponse } from 'next/server';
import { getBuilds } from '@/db/queries';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const builds = await getBuilds();
  return NextResponse.json({ builds });
}
