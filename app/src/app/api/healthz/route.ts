import { NextResponse } from 'next/server';
import { ping } from '@/db/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ping();
    return NextResponse.json({ status: 'ok' });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: String(e) }, { status: 500 });
  }
}
