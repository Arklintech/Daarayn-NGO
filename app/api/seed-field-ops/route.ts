import { NextResponse } from 'next/server';

/**
 * This endpoint has been permanently decommissioned.
 *
 * It was a one-time development-only Firestore seeder. Firestore is NOT
 * the production datastore — Google Sheets is. This route has no
 * operational purpose and is disabled to prevent confusion and errors.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been permanently removed.' },
    { status: 410 }
  );
}
