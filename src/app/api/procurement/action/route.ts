import { NextResponse } from "next/server";
import {
  approveHumanQueueTransaction,
  freezeTransaction,
  verifyDeliveryAndSettle,
} from "@/lib/engine/stateMachine";
import { ProcurementTransaction } from "@/types/aegis";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action:
        | "APPROVE_HUMAN_QUEUE"
        | "VERIFY_DELIVERY_100"
        | "VERIFY_DELIVERY_PARTIAL"
        | "FREEZE_TRANSACTION"
        | "BATCH_APPROVE"
        | "BATCH_FREEZE";
      transactionId?: string;
      transactionIds?: string[];
      deliveredUnits?: number;
      approverId?: string;
      reason?: string;
    };

    if (body.action === "APPROVE_HUMAN_QUEUE" && body.transactionId) {
      const tx = await approveHumanQueueTransaction(
        body.transactionId,
        body.approverId || "CFO-DUALKEY-HSM-01"
      );
      return NextResponse.json({ transaction: tx });
    }

    if (body.action === "VERIFY_DELIVERY_100" && body.transactionId) {
      const tx = await verifyDeliveryAndSettle({
        transactionId: body.transactionId,
        deliveredUnits: body.deliveredUnits ?? 100,
      });
      return NextResponse.json({ transaction: tx });
    }

    if (body.action === "VERIFY_DELIVERY_PARTIAL" && body.transactionId) {
      const tx = await verifyDeliveryAndSettle({
        transactionId: body.transactionId,
        deliveredUnits: body.deliveredUnits ?? 80,
      });
      return NextResponse.json({ transaction: tx });
    }

    if (body.action === "FREEZE_TRANSACTION" && body.transactionId) {
      const tx = freezeTransaction(
        body.transactionId,
        body.reason || "Frozen manually by Compliance Officer via AG Grid"
      );
      return NextResponse.json({ transaction: tx });
    }

    if (body.action === "BATCH_APPROVE" && Array.isArray(body.transactionIds)) {
      const updated: ProcurementTransaction[] = [];
      for (const id of body.transactionIds) {
        const tx = await approveHumanQueueTransaction(
          id,
          body.approverId || "CFO-BATCH-APPROVER-KEY"
        );
        updated.push(tx);
      }
      return NextResponse.json({ transactions: updated });
    }

    if (body.action === "BATCH_FREEZE" && Array.isArray(body.transactionIds)) {
      const updated: ProcurementTransaction[] = [];
      for (const id of body.transactionIds) {
        const tx = freezeTransaction(
          id,
          body.reason || "Batch Frozen by Compliance Officer via AG Grid"
        );
        updated.push(tx);
      }
      return NextResponse.json({ transactions: updated });
    }

    return NextResponse.json(
      { error: "Invalid action or missing transactionId(s)" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
