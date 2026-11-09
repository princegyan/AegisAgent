import { NextResponse } from "next/server";
import {
  executeProcurementPipeline,
  listAllTransactions,
} from "@/lib/engine/stateMachine";
import { ENTERPRISE_SCENARIOS } from "@/lib/engine/scenarios";
import { APIMATIC_PAYPAL_OPERATIONS } from "@/lib/paypal/apimaticBindings";
import { isPayPalConfigured } from "@/lib/paypal/paypalClient";
import { StrictRFQ } from "@/types/aegis";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    transactions: listAllTransactions(),
    scenarios: ENTERPRISE_SCENARIOS,
    apimaticOperations: APIMATIC_PAYPAL_OPERATIONS,
    paypalConfigured: isPayPalConfigured(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      scenarioId?: string;
      customRfq?: StrictRFQ;
      allowDuplicateForRetry?: boolean;
    };

    let targetRfq: StrictRFQ | undefined = body.customRfq;

    if (!targetRfq && body.scenarioId) {
      const preset = ENTERPRISE_SCENARIOS.find((s) => s.id === body.scenarioId);
      if (!preset) {
        return NextResponse.json(
          { error: `Unknown scenarioId: ${body.scenarioId}` },
          { status: 400 }
        );
      }
      // Make invoice number unique per run unless testing duplicate invoice detection explicitly
      const suffix = Math.floor(1000 + Math.random() * 9000);
      targetRfq = {
        ...preset.rfq,
        rfqId: `${preset.rfq.rfqId}-${suffix}`,
        invoiceNumber: body.allowDuplicateForRetry
          ? preset.rfq.invoiceNumber
          : `${preset.rfq.invoiceNumber}-${suffix}`,
      };
    }

    if (!targetRfq) {
      return NextResponse.json(
        { error: "Must provide either scenarioId or customRfq payload" },
        { status: 400 }
      );
    }

    const transaction = await executeProcurementPipeline(targetRfq, {
      allowDuplicateForRetry: body.allowDuplicateForRetry,
    });

    return NextResponse.json({ transaction });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
