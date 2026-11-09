import { subscribeTelemetry, listAllTransactions } from "@/lib/engine/stateMachine";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial snapshot of transactions
      const initialPayload = JSON.stringify({
        eventId: `INIT-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: "INITIAL_SNAPSHOT",
        transactions: listAllTransactions(),
      });
      controller.enqueue(encoder.encode(`data: ${initialPayload}\n\n`));

      unsubscribe = subscribeTelemetry((event) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // client closed stream
        }
      });
    },
    cancel() {
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
