"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllEnterpriseModule,
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-enterprise";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  KeyRound,
  Lock,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import {
  ProcurementState,
  ProcurementTransaction,
  STATE_PIPELINE_ORDER,
} from "@/types/aegis";

ModuleRegistry.registerModules([AllEnterpriseModule]);

const gumroadGridTheme = themeQuartz.withParams({
  backgroundColor: "#FFFFFF",
  foregroundColor: "#000000",
  headerBackgroundColor: "#F4F4F0",
  headerTextColor: "#000000",
  borderColor: "#000000",
  rowHoverColor: "#FFF0FB",
  selectedRowBackgroundColor: "#FFE0F7",
  oddRowBackgroundColor: "#FAF9F5",
  fontFamily:
    '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 800,
});

interface FlightDeckGridProps {
  transactions: ProcurementTransaction[];
  busyTxId: string | null;
  onTriggerAction: (
    action:
      | "APPROVE_HUMAN_QUEUE"
      | "VERIFY_DELIVERY_100"
      | "VERIFY_DELIVERY_PARTIAL"
      | "FREEZE_TRANSACTION",
    transactionId: string
  ) => Promise<void>;
  onBatchAction: (
    action: "BATCH_APPROVE" | "BATCH_FREEZE",
    transactionIds: string[]
  ) => Promise<void>;
  onSelectTransactionForInspector?: (tx: ProcurementTransaction) => void;
}

function getStateProgress(state: ProcurementState): {
  step: number;
  total: number;
  percent: number;
  fillBg: string;
  pillBg: string;
  badgeText: string;
} {
  if (state === "HUMAN_APPROVAL_QUEUE") {
    return {
      step: 3,
      total: 6,
      percent: 50,
      fillBg: "bg-[#FFC900]",
      pillBg: "bg-[#FFC900] text-black",
      badgeText: "HUMAN_APPROVAL_QUEUE",
    };
  }
  if (state === "FROZEN_BY_COMPLIANCE") {
    return {
      step: 0,
      total: 6,
      percent: 100,
      fillBg: "bg-[#FF7051]",
      pillBg: "bg-[#FF7051] text-black",
      badgeText: "FROZEN_BY_COMPLIANCE",
    };
  }
  if (state === "DISPUTED_INVOICED") {
    return {
      step: 6,
      total: 6,
      percent: 100,
      fillBg: "bg-[#B8A9FF]",
      pillBg: "bg-[#B8A9FF] text-black",
      badgeText: "DISPUTED_INVOICED (v2 Memo)",
    };
  }
  const idx = STATE_PIPELINE_ORDER.indexOf(state);
  const step = idx >= 0 ? idx + 1 : 1;
  const percent = Math.round((step / STATE_PIPELINE_ORDER.length) * 100);
  const isCaptured = state === "PAYPAL_CAPTURED";
  const isAuth = state === "PAYPAL_AUTH_CREATED";

  return {
    step,
    total: STATE_PIPELINE_ORDER.length,
    percent,
    fillBg: isCaptured
      ? "bg-[#23A094]"
      : isAuth
      ? "bg-[#FF90E8]"
      : "bg-[#90E0EF]",
    pillBg: isCaptured
      ? "bg-[#98F5E1] text-black"
      : isAuth
      ? "bg-[#FF90E8] text-black"
      : "bg-[#90E0EF] text-black",
    badgeText: state,
  };
}

/**
 * Master-Detail Drilldown Component rendered inside AG Grid Enterprise detail rows
 * Styled with Gumroad Neo-Brutalist cards, hard shadows, and crisp borders.
 */
const TransactionDetailPanel: React.FC<
  ICellRendererParams<ProcurementTransaction>
> = ({ data }) => {
  if (!data) return null;

  return (
    <div className="p-5 bg-[#F4F4F0] border-t-2 border-b-2 border-black text-xs text-black space-y-4 overflow-y-auto max-h-[460px]">
      {/* Top 4-column Gumroad cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Card 1: Agent 1 Multimodal Sourcing & Threat Scan */}
        <div className="bg-white border-2 border-black rounded-xl p-3.5 shadow-[4px_4px_0px_0px_#000000]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-black text-black flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 fill-[#FF90E8]" /> Agent 1: Sourcing
              &amp; Threat
            </span>
            <span
              className={`px-2 py-0.5 rounded-full border-2 border-black text-[10px] font-mono font-bold ${
                data.threatModel.passed ? "bg-[#98F5E1]" : "bg-[#FF7051]"
              }`}
            >
              Threat: {data.threatModel.threatScore}/100
            </span>
          </div>
          <p className="text-neutral-700 text-[11px] font-medium leading-relaxed mb-2">
            {data.threatModel.analysisSummary}
          </p>
          <div className="bg-[#F4F4F0] rounded-lg p-2 border-2 border-black font-mono text-[10px] text-black">
            <div className="font-bold">
              SKU: {data.rfq.lineItems[0]?.sku} • Qty:{" "}
              {data.rfq.lineItems[0]?.quantityOrdered} units @ $
              {data.rfq.lineItems[0]?.unitPriceUsd.toFixed(2)}
            </div>
            <div>
              Incoterms: {data.rfq.incoterms} • Lead: {data.rfq.leadTimeDays}d •
              Tax: ${data.rfq.taxAmountUsd.toFixed(2)} • Logistics: $
              {data.rfq.logisticsFeeUsd.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Card 2: Agent 2 Compliance, Sanctions & Price Anomaly */}
        <div className="bg-white border-2 border-black rounded-xl p-3.5 shadow-[4px_4px_0px_0px_#000000]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-black text-black flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 fill-[#FFC900]" /> Agent 2: Risk
              &amp; Price
            </span>
            <span
              className={`px-2 py-0.5 rounded-full border-2 border-black text-[10px] font-mono font-bold ${
                data.compliance.passed ? "bg-[#98F5E1]" : "bg-[#FFC900]"
              }`}
            >
              Risk: {data.compliance.overallRiskScore}/100
            </span>
          </div>
          <div className="space-y-1 text-[11px] font-medium text-black">
            <div>
              KYC:{" "}
              <span className="font-mono font-bold px-1.5 py-0.2 bg-[#F4F4F0] border border-black rounded">
                {data.compliance.kycStatus}
              </span>{" "}
              • SLA:{" "}
              <span className="font-mono font-bold text-[#23A094]">
                {data.compliance.historicalSlaReliability}%
              </span>
            </div>
            <div>
              Invoice SHA-256:{" "}
              <span className="font-mono text-neutral-600">
                {data.compliance.duplicateInvoiceHash.slice(0, 18)}...
              </span>
            </div>
            <div>
              Variance vs. Median:{" "}
              <span
                className={`font-mono font-bold px-1.5 py-0.5 rounded border border-black ${
                  data.compliance.priceAnomaly.isAnomalous
                    ? "bg-[#FFC900]"
                    : "bg-[#98F5E1]"
                }`}
              >
                {data.compliance.priceAnomaly.deviationPercent > 0 ? "+" : ""}
                {data.compliance.priceAnomaly.deviationPercent}%
              </span>{" "}
              (Max ±15%)
            </div>
          </div>
          {data.compliance.priceAnomaly.disputeInquiryDraft && (
            <div className="mt-2 p-2 rounded-lg bg-[#FFC900]/40 border-2 border-black text-[10px] text-black">
              <div className="font-black">
                Dispute Inquiry (
                {data.compliance.priceAnomaly.disputeInquiryDraft.inquiryId}):
              </div>
              <div className="line-clamp-2 font-medium">
                {data.compliance.priceAnomaly.disputeInquiryDraft.body}
              </div>
            </div>
          )}
        </div>

        {/* Card 3: Deterministic Constraint Solver & Dual-Key Signatures */}
        <div className="bg-white border-2 border-black rounded-xl p-3.5 shadow-[4px_4px_0px_0px_#000000]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-black text-black flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 fill-[#B8A9FF]" /> Solver &amp;
              Dual-Key Log
            </span>
            <span className="px-2 py-0.5 rounded-full border-2 border-black text-[10px] font-mono font-bold bg-[#B8A9FF]">
              Utility: {data.solver.compositeUtilityScore}/100
            </span>
          </div>
          <div className="font-mono text-[10px] text-black space-y-1 bg-[#F4F4F0] p-2 rounded-lg border-2 border-black">
            <div className="font-bold">{data.solver.solverProofFormula}</div>
            <div className="truncate">
              Agent Sig ({data.dualKey.agentKeyId}):{" "}
              <span className="text-neutral-600">
                {data.dualKey.agentSignature.slice(0, 22)}...
              </span>
            </div>
            <div className="truncate">
              Human Key:{" "}
              <span
                className={`font-bold px-1 rounded ${
                  data.dualKey.dualKeyVerified
                    ? "bg-[#98F5E1]"
                    : "bg-[#FFC900]"
                }`}
              >
                {data.dualKey.humanSignature
                  ? `${data.dualKey.humanApproverId}`
                  : "AWAITING_HUMAN_KEY"}
              </span>
            </div>
            <div className="truncate font-bold">
              Merkle: {data.dualKey.currentMerkleHash}
            </div>
          </div>
        </div>

        {/* Card 4: Agent 3 PayPal Settlement & Escrow Status */}
        <div className="bg-white border-2 border-black rounded-xl p-3.5 shadow-[4px_4px_0px_0px_#000000]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-black text-black">
              Agent 3: PayPal v2 Lifecycle
            </span>
            <span className="px-2 py-0.5 rounded-full border-2 border-black text-[10px] font-mono font-bold bg-[#FF90E8]">
              {data.paypal.status}
            </span>
          </div>
          <div className="space-y-1 text-[11px] font-mono text-black">
            <div>
              Order ID (v2):{" "}
              <span className="font-bold">
                {data.paypal.orderId || "Not created yet"}
              </span>
            </div>
            {data.paypal.invoiceId && (
              <div className="bg-[#B8A9FF]/40 px-1.5 py-0.5 rounded border border-black">
                Discrepancy Invoice:{" "}
                <span className="font-bold">
                  {data.paypal.invoiceId} (-$
                  {data.paypal.discrepancyCreditMemoUsd?.toFixed(2)})
                </span>
              </div>
            )}
            {data.paypal.payoutBatchId && (
              <div className="bg-[#98F5E1] px-1.5 py-0.5 rounded border border-black">
                Payout Batch:{" "}
                <span className="font-bold">{data.paypal.payoutBatchId}</span>
              </div>
            )}
            {data.paypal.approvalUrl && (
              <div className="pt-1">
                <a
                  href={data.paypal.approvalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border-2 border-black bg-[#FF90E8] hover:bg-[#FFC900] text-black font-bold text-[10px] shadow-[2px_2px_0px_0px_#000000]"
                >
                  Open PayPal Sandbox Checkout{" "}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {data.paypal.lastError && (
              <div className="p-1.5 rounded bg-[#FF7051]/30 border border-black text-black font-bold text-[10px] leading-snug mt-1">
                {data.paypal.lastError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom 2 columns: Live Agent Reasoning Trace & APIMatic-Validated PayPal API Calls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border-2 border-black rounded-xl p-3.5 shadow-[4px_4px_0px_0px_#000000]">
          <div className="text-xs font-black text-black mb-2 flex items-center justify-between">
            <span>
              Latent Multi-Agent Reasoning Trace ({data.reasoningTrace.length}{" "}
              steps)
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#F4F4F0] border border-black">
              {data.totalTokensUsed} tokens • $
              {data.totalTokenCostUsd.toFixed(5)}
            </span>
          </div>
          <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
            {data.reasoningTrace.map((step) => (
              <div
                key={step.stepId}
                className="p-2 rounded-lg bg-[#F4F4F0] border-2 border-black text-[11px]"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-700 mb-0.5">
                  <span className="font-bold text-black bg-[#FF90E8] px-1.5 rounded border border-black">
                    {step.agentName}
                  </span>
                  <span className="font-bold">
                    {step.stateBefore} → {step.stateAfter} •{" "}
                    {(step.confidence * 100).toFixed(1)}% • {step.durationMs}ms
                  </span>
                </div>
                <div className="text-black font-medium mt-1">{step.thought}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border-2 border-black rounded-xl p-3.5 shadow-[4px_4px_0px_0px_#000000]">
          <div className="text-xs font-black text-black mb-2">
            APIMatic OpenAPI Tool Calls &amp; PayPal Sandbox Telemetry (
            {data.paypal.apiTraces.length} calls)
          </div>
          {data.paypal.apiTraces.length === 0 ? (
            <div className="text-neutral-600 text-[11px] font-medium py-4 bg-[#F4F4F0] rounded-lg border-2 border-dashed border-black text-center">
              No PayPal Sandbox HTTP calls executed yet for this transaction
              (held by governance policy or awaiting Dual-Key execution).
            </div>
          ) : (
            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              {data.paypal.apiTraces.map((trace) => (
                <div
                  key={trace.callId}
                  className="p-2 rounded-lg bg-[#F4F4F0] border-2 border-black font-mono text-[10px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-black bg-[#98F5E1] px-1.5 rounded border border-black">
                      [{trace.apimaticOperationId}] {trace.method}{" "}
                      {trace.endpoint}
                    </span>
                    <span
                      className={`font-bold px-1.5 rounded border border-black ${
                        trace.httpStatus >= 200 && trace.httpStatus < 300
                          ? "bg-[#98F5E1]"
                          : "bg-[#FFC900]"
                      }`}
                    >
                      HTTP {trace.httpStatus} • {trace.latencyMs}ms • ID:{" "}
                      {trace.paypalResourceId || "N/A"}
                    </span>
                  </div>
                  <div className="text-neutral-700 truncate mt-1">
                    Response:{" "}
                    {JSON.stringify(trace.responsePayload).slice(0, 180)}...
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const FlightDeckGrid: React.FC<FlightDeckGridProps> = ({
  transactions,
  busyTxId,
  onTriggerAction,
  onBatchAction,
  onSelectTransactionForInspector,
}) => {
  const gridRef = useRef<AgGridReact<ProcurementTransaction>>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);

  const onSelectionChanged = useCallback(() => {
    const rows = gridRef.current?.api?.getSelectedRows() || [];
    setSelectedIds(rows.map((r) => r.transactionId));
  }, []);

  const handleBatch = async (action: "BATCH_APPROVE" | "BATCH_FREEZE") => {
    if (selectedIds.length === 0) return;
    setBatchBusy(true);
    try {
      await onBatchAction(action, selectedIds);
      gridRef.current?.api?.deselectAll();
    } finally {
      setBatchBusy(false);
    }
  };

  const columnDefs = useMemo<ColDef<ProcurementTransaction>[]>(
    () => [
      {
        headerName: "TRANSACTION & MERKLE HASH",
        field: "transactionId",
        minWidth: 235,
        flex: 1.2,
        cellRenderer: "agGroupCellRenderer",
        cellRendererParams: {
          innerRenderer: (
            params: ICellRendererParams<ProcurementTransaction>
          ) => {
            const tx = params.data;
            if (!tx) return null;
            return (
              <div className="flex flex-col py-1 leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black text-black">
                    {tx.transactionId}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#FF90E8] border border-black text-black">
                    {tx.rfq.rfqId}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-neutral-600">
                  Merkle: {tx.dualKey.currentMerkleHash.slice(0, 16)}...
                </span>
              </div>
            );
          },
        },
      },
      {
        headerName: "TIME",
        field: "createdAt",
        width: 110,
        cellRenderer: (params: ICellRendererParams<ProcurementTransaction>) => {
          if (!params.value) return null;
          const d = new Date(params.value);
          return (
            <span className="font-mono text-xs font-bold text-black">
              {d.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          );
        },
      },
      {
        headerName: "VENDOR & INCOTERMS",
        minWidth: 205,
        flex: 1.1,
        valueGetter: (p) => p.data?.rfq.vendorName,
        cellRenderer: (params: ICellRendererParams<ProcurementTransaction>) => {
          const tx = params.data;
          if (!tx) return null;
          return (
            <div className="flex flex-col py-1 leading-tight">
              <div className="font-extrabold text-black truncate">
                {tx.rfq.vendorName}
              </div>
              <div className="text-[11px] text-neutral-700 font-mono">
                {tx.rfq.vendorId} •{" "}
                <span className="font-bold px-1 bg-[#90E0EF] border border-black rounded text-black">
                  {tx.rfq.incoterms}
                </span>{" "}
                • {tx.rfq.leadTimeDays}d
              </div>
            </div>
          );
        },
      },
      {
        headerName: "QUOTED VS. BASELINE",
        minWidth: 215,
        flex: 1.1,
        valueGetter: (p) => p.data?.rfq.totalAmountUsd,
        cellRenderer: (params: ICellRendererParams<ProcurementTransaction>) => {
          const tx = params.data;
          if (!tx) return null;
          const dev = tx.compliance.priceAnomaly.deviationPercent;
          const isAnom = tx.compliance.priceAnomaly.isAnomalous;
          return (
            <div className="flex flex-col py-1 leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-black">
                  $
                  {tx.rfq.totalAmountUsd.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-black font-bold ${
                    isAnom ? "bg-[#FFC900] text-black" : "bg-[#98F5E1] text-black"
                  }`}
                >
                  {dev > 0 ? `+${dev}%` : `${dev}%`}
                </span>
              </div>
              <div className="text-[10px] font-mono text-neutral-600">
                90d Median: $
                {tx.rfq.baselineTotalUsd.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
          );
        },
      },
      {
        headerName: "CONFIDENCE & TOKENS",
        minWidth: 180,
        valueGetter: (p) => p.data?.agentConfidence,
        cellRenderer: (params: ICellRendererParams<ProcurementTransaction>) => {
          const tx = params.data;
          if (!tx) return null;
          const pct = Math.round(tx.agentConfidence * 100);
          const barColor =
            pct >= 90
              ? "bg-[#23A094]"
              : pct >= 70
              ? "bg-[#FFC900]"
              : "bg-[#FF7051]";
          return (
            <div className="flex flex-col py-1.5 leading-tight w-full pr-2">
              <div className="flex items-center justify-between text-xs font-mono mb-1">
                <span className="font-black text-black">
                  {(tx.agentConfidence * 100).toFixed(1)}%
                </span>
                <span className="text-[10px] font-bold text-neutral-600">
                  {tx.totalTokensUsed}t (${tx.totalTokenCostUsd.toFixed(4)})
                </span>
              </div>
              <div className="w-full h-2.5 bg-white border-2 border-black rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-300`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        headerName: "STATE MACHINE PIPELINE",
        field: "currentState",
        minWidth: 240,
        flex: 1.2,
        cellRenderer: (params: ICellRendererParams<ProcurementTransaction>) => {
          const tx = params.data;
          if (!tx) return null;
          const prog = getStateProgress(tx.currentState);
          return (
            <div className="flex flex-col py-1.5 leading-tight w-full pr-2">
              <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                <span
                  className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full border border-black ${prog.pillBg}`}
                >
                  {tx.currentState === "HUMAN_APPROVAL_QUEUE" && (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  {tx.currentState === "PAYPAL_CAPTURED" && (
                    <CheckCircle2 className="w-3 h-3" />
                  )}
                  {tx.currentState === "FROZEN_BY_COMPLIANCE" && (
                    <Lock className="w-3 h-3" />
                  )}
                  {prog.badgeText}
                </span>
                <span className="text-[10px] font-bold text-black">
                  {prog.step}/{prog.total}
                </span>
              </div>
              <div className="w-full h-2 bg-white border-2 border-black rounded-full overflow-hidden">
                <div
                  className={`h-full ${prog.fillBg} transition-all duration-300`}
                  style={{ width: `${prog.percent}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        headerName: "PAYPAL STATUS & ID",
        minWidth: 215,
        flex: 1.1,
        valueGetter: (p) => p.data?.paypal.status,
        cellRenderer: (params: ICellRendererParams<ProcurementTransaction>) => {
          const tx = params.data;
          if (!tx) return null;
          const st = tx.paypal.status;
          const badgeStyle =
            st === "CAPTURED" || st === "PAYOUT_DISBURSED"
              ? "bg-[#98F5E1] text-black"
              : st === "AUTHORIZED"
              ? "bg-[#FF90E8] text-black"
              : st === "PARTIALLY_CAPTURED_AND_INVOICED"
              ? "bg-[#B8A9FF] text-black"
              : st === "FROZEN" || st === "API_ERROR"
              ? "bg-[#FF7051] text-black"
              : "bg-[#FFC900] text-black";

          return (
            <div className="flex flex-col py-1 leading-tight">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border border-black font-bold ${badgeStyle}`}
                >
                  {st}
                </span>
              </div>
              <div className="text-[10px] font-mono font-bold text-neutral-700 truncate mt-0.5">
                {tx.paypal.payoutBatchId
                  ? `Payout: ${tx.paypal.payoutBatchId}`
                  : tx.paypal.invoiceId
                  ? `Invoice: ${tx.paypal.invoiceId}`
                  : tx.paypal.orderId
                  ? `Order: ${tx.paypal.orderId}`
                  : "Awaiting PayPal Auth"}
              </div>
            </div>
          );
        },
      },
      {
        headerName: "AUTONOMOUS & HITL ACTIONS",
        minWidth: 310,
        flex: 1.4,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<ProcurementTransaction>) => {
          const tx = params.data;
          if (!tx) return null;
          const isBusy = busyTxId === tx.transactionId;

          return (
            <div className="flex items-center gap-1.5 py-1.5">
              {(tx.currentState === "HUMAN_APPROVAL_QUEUE" ||
                tx.paypal.status === "API_ERROR") && (
                <button
                  disabled={isBusy}
                  onClick={() =>
                    onTriggerAction("APPROVE_HUMAN_QUEUE", tx.transactionId)
                  }
                  className="px-2.5 py-1 rounded-lg bg-[#FFC900] hover:bg-[#FF90E8] border-2 border-black text-black text-[11px] font-bold flex items-center gap-1 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
                  title="Sign with Human Compliance Key & Execute PayPal Order (AUTHORIZE)"
                >
                  <KeyRound className="w-3 h-3" />
                  {isBusy ? "Signing..." : "Dual-Key Approve"}
                </button>
              )}

              {tx.currentState === "PAYPAL_AUTH_CREATED" && (
                <>
                  <button
                    disabled={isBusy}
                    onClick={() =>
                      onTriggerAction("VERIFY_DELIVERY_100", tx.transactionId)
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#98F5E1] hover:bg-[#FF90E8] border-2 border-black text-black text-[11px] font-bold flex items-center gap-1 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
                    title="Verify 100% Milestone Delivery → Capture & Multi-Tier Payout"
                  >
                    <Truck className="w-3 h-3" />
                    {isBusy ? "Settling..." : "100% Settle"}
                  </button>
                  <button
                    disabled={isBusy}
                    onClick={() =>
                      onTriggerAction(
                        "VERIFY_DELIVERY_PARTIAL",
                        tx.transactionId
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#B8A9FF] hover:bg-[#FF90E8] border-2 border-black text-black text-[11px] font-bold flex items-center gap-1 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
                    title="Simulate Partial Delivery (80/100 units) → Generate PayPal v2 Discrepancy Invoice"
                  >
                    <FileWarning className="w-3 h-3" />
                    80% Partial
                  </button>
                </>
              )}

              {tx.currentState !== "FROZEN_BY_COMPLIANCE" &&
                tx.currentState !== "PAYPAL_CAPTURED" && (
                  <button
                    disabled={isBusy}
                    onClick={() =>
                      onTriggerAction("FREEZE_TRANSACTION", tx.transactionId)
                    }
                    className="px-2 py-1 rounded-lg bg-[#FF7051] hover:bg-[#FFC900] border-2 border-black text-black text-[11px] font-bold flex items-center gap-1 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
                    title="Freeze Transaction"
                  >
                    <Lock className="w-3 h-3" />
                  </button>
                )}

              <button
                onClick={() => onSelectTransactionForInspector?.(tx)}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#FF90E8] border-2 border-black text-black text-[11px] font-mono font-bold shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                title="Inspect Full Audit & Cryptographic Proof"
              >
                Inspect
              </button>
            </div>
          );
        },
      },
    ],
    [busyTxId, onTriggerAction, onSelectTransactionForInspector]
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      sortable: true,
      filter: true,
    }),
    []
  );

  return (
    <div className="flex flex-col w-full">
      {/* Gumroad Neo-Brutalist Batch Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[#FFC900] border-b-2 border-black">
        <div className="flex items-center gap-2.5 text-xs text-black">
          <span className="px-2.5 py-1 rounded-full bg-black text-white font-mono font-bold text-[11px]">
            AG GRID ENTERPRISE
          </span>
          <span className="font-black text-sm">
            Live Operational Flight Deck
          </span>
          <span className="hidden sm:inline text-black/80 font-medium">
            — Click any row&apos;s <span className="font-mono font-bold">▸</span>{" "}
            chevron to open the Master-Detail PayPal &amp; Reasoning Audit Deck
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-white border-2 border-black">
            {selectedIds.length} selected
          </span>
          <button
            disabled={selectedIds.length === 0 || batchBusy}
            onClick={() => handleBatch("BATCH_APPROVE")}
            className="gumroad-btn px-3 py-1.5 bg-[#FF90E8] text-black text-xs flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Batch Dual-Key Approve ({selectedIds.length})
          </button>
          <button
            disabled={selectedIds.length === 0 || batchBusy}
            onClick={() => handleBatch("BATCH_FREEZE")}
            className="gumroad-btn px-3 py-1.5 bg-[#FF7051] text-black text-xs flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Batch Freeze ({selectedIds.length})
          </button>
        </div>
      </div>

      {/* AG Grid Enterprise Container */}
      <div className="w-full h-[520px]">
        <AgGridReact<ProcurementTransaction>
          ref={gridRef}
          theme={gumroadGridTheme}
          rowData={transactions}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(params) => params.data.transactionId}
          rowHeight={60}
          headerHeight={42}
          rowSelection={{
            mode: "multiRow",
            checkboxes: true,
            headerCheckbox: true,
          }}
          onSelectionChanged={onSelectionChanged}
          masterDetail={true}
          detailRowAutoHeight={true}
          detailCellRenderer={TransactionDetailPanel}
          animateRows={true}
        />
      </div>
    </div>
  );
};
