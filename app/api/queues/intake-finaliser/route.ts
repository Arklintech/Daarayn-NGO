import { handleCallback } from "@vercel/queue";
import { NextResponse } from "next/server";
import { handleDrain, intakeRetryPolicy } from "@/lib/intake/queue/consumer";
import { vercelQueueTransport } from "@/lib/intake/queue/vercelTransport";
import { intakeModeEnabled } from "@/lib/intake/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // bounded: a delivery spends at most its budget, then hands the rest to a later wake-up

/**
 * The finaliser's queue consumer (D38). On Vercel a consumer configured with a `queue/v2beta` trigger has no public URL and can only be invoked by the queue
 * (https://vercel.com/docs/queues/concepts#consumer-function-security). It is NOT registered in the repository's vercel.json: the trigger lives in
 * deploy/vercel.d38-preview.json and is applied only to a deliberate Preview deployment. As a second guard the route answers 404 unless DONATION_INTAKE_MODE=queued.
 * The message is only a wake-up: the finaliser reads the pending rows from Google Sheets itself, in intake order.
 */
const inner = handleCallback<unknown>(
  async (message, metadata) => {
    await handleDrain(message, { messageId: metadata.messageId, deliveryCount: metadata.deliveryCount }, { transport: vercelQueueTransport });
  },
  { retry: (error, metadata) => intakeRetryPolicy(error, { deliveryCount: metadata.deliveryCount }) }
);

export async function POST(request: Request) {
  if (!intakeModeEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return inner(request);
}
