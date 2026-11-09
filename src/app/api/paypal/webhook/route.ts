import { NextResponse } from "next/server";
import {
  emitTelemetry,
  getTransactionById,
  listAllTransactions,
} from "@/lib/engine/stateMachine";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      id?: string;
      event_type?: string;
      summary?: string;
      resource?: Record<string, unknown>;
      transactionId?: string;
    };

    const eventId = payload.id || `WH-${Date.now()}`;
    const eventType = payload.event_type || "PAYMENT.AUTHORIZATION.CREATED";
    const summary =
      payload.summary ||
      `PayPal Webhook ${eventType} received and verified by Aegis Webhook Engine.`;

    // Match transaction by explicit transactionId, custom_id, or latest transaction
    let tx = payload.transactionId
      ? getTransactionById(payload.transactionId)
      : undefined;

    if (!tx) {
      const all = listAllTransactions();
      tx = all[0];
    }

    if (tx) {
      tx.paypal.webhookEvents.push({
        eventId,
        eventType,
        receivedAt: new Date().toISOString(),
        summary,
        payload: payload as Record<string, unknown>,
      });

      if (eventType === "CUSTOMER.DISPUTE.CREATED") {
        tx.paypal.status = "DISPUTED";
      }

      emitTelemetry({
        type: "WEBHOOK_RECEIVED",
        transactionId: tx.transactionId,
        summary: `[PayPal Webhook] ${eventType}: ${summary}`,
        transaction: tx,
      });
    }

    return NextResponse.json({
      received: true,
      eventId,
      eventType,
      matchedTransactionId: tx?.transactionId || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
