import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';

export const dynamic = 'force-dynamic';

/** Liveness/readiness probe. Exposes no data. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
