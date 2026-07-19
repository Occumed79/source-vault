import { NextResponse } from 'next/server';
import { query } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [database] = await query('SELECT current_database() AS database_name, NOW() AS checked_at');
    return NextResponse.json({
      ok: true,
      service: 'docbox',
      database: database?.database_name || 'connected',
      checkedAt: database?.checked_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    return NextResponse.json({
      ok: false,
      service: 'docbox',
      error: error instanceof Error ? error.message : 'Database health check failed.',
    }, { status: 503 });
  }
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
