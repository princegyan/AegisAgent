"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  CheckCircle2,
  Code2,
  Cpu,
  DollarSign,
  ExternalLink,
  FileCheck2,
  Film,
  KeyRound,
  Layers,
  Play,
  Radio,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  Webhook,
  X,
} from "lucide-react";
import { FlightDeckGrid } from "@/components/FlightDeckGrid";
import {
  ProcurementTransaction,
  STATE_PIPELINE_ORDER,
  TelemetrySSEEvent,
} from "@/types/aegis";
import type { ScenarioPreset } from "@/lib/engine/scenarios";

interface PayPalStatusInfo {
  configured: boolean;
  authenticated?: boolean;
  baseUrl?: string;
  appId?: string;
  maskedClientId?: string | null;
  message?: string;
}

interface ApimaticOp {
  operationId: string;
  endpoint: string;
  openApiSpecVersion: string;
  description: string;
}

export default function AegisAgentControlPlane() {
  const [transactions, setTransactions] = useState<ProcurementTransaction[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioPreset[]>([]);
  const [apimaticOps, setApimaticOps] = useState<ApimaticOp[]>([]);
  const [sseEvents, setSseEvents] = useState<TelemetrySSEEvent[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [selectedTx, setSelectedTx] = useState<ProcurementTransaction | null>(
    null
  );

  const [busyScenarioId, setBusyScenarioId] = useState<string | null>(null);
  const [busyTxId, setBusyTxId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // PayPal Credentials Modal State
  const [paypalInfo, setPaypalInfo] = useState<PayPalStatusInfo>({
    configured: false,
  });
  const [showCredModal, setShowCredModal] = useState(false);
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [persistEnv, setPersistEnv] = useState(true);
  const [savingCreds, setSavingCreds] = useState(false);
  const [credModalError, setCredModalError] = useState<string | null>(null);

  const fetchInitialData = useCallback(async () => {
    try {
      const [procRes, ppRes] = await Promise.all([
        fetch("/api/procurement"),
        fetch("/api/paypal/credentials"),
      ]);
      if (procRes.ok) {
        const data = await procRes.json();
        setTransactions(data.transactions || []);
        setScenarios(data.scenarios || []);
        setApimaticOps(data.apimaticOperations || []);
        if ((data.transactions || []).length > 0 && !selectedTx) {
          setSelectedTx(data.transactions[0]);
        }
      }
      if (ppRes.ok) {
        const ppData = await ppRes.json();
        setPaypalInfo(ppData);
      }
    } catch {
      // ignore initial fetch error
    }
  }, [selectedTx]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Connect to Real-Time SSE Telemetry Stream (/api/stream)
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (
          payload.type === "INITIAL_SNAPSHOT" &&
          Array.isArray(payload.transactions)
        ) {
          setTransactions(payload.transactions);
          setSseConnected(true);
          return;
        }
        const event = payload as TelemetrySSEEvent;
        setSseEvents((prev) => [event, ...prev.slice(0, 59)]);

        if (event.transaction) {
          const updatedTx = event.transaction;
          setTransactions((prev) => {
            const exists = prev.some(
              (t) => t.transactionId === updatedTx.transactionId
            );
            if (!exists) return [updatedTx, ...prev];
            return prev.map((t) =>
              t.transactionId === updatedTx.transactionId ? updatedTx : t
            );
          });
          setSelectedTx((curr) =>
            !curr || curr.transactionId === updatedTx.transactionId
              ? updatedTx
              : curr
          );
        }
      } catch {
        // ignore malformed event
      }
    };

    return () => {
      es.close();
    };
  }, []);

  const handleRunScenario = async (scenarioId: string) => {
    setBusyScenarioId(scenarioId);
    setBannerError(null);
    try {
      const res = await fetch("/api/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerError(data.error || "Failed to execute scenario");
      } else if (data.transaction) {
        const tx = data.transaction as ProcurementTransaction;
        setTransactions((prev) => {
          const filtered = prev.filter(
            (t) => t.transactionId !== tx.transactionId
          );
          return [tx, ...filtered];
        });
        setSelectedTx(tx);
      }
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusyScenarioId(null);
    }
  };

  const handleGridAction = useCallback(
    async (
      action:
        | "APPROVE_HUMAN_QUEUE"
        | "VERIFY_DELIVERY_100"
        | "VERIFY_DELIVERY_PARTIAL"
        | "FREEZE_TRANSACTION",
      transactionId: string
    ) => {
      setBusyTxId(transactionId);
      setBannerError(null);
      try {
        const res = await fetch("/api/procurement/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, transactionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setBannerError(data.error || "Action failed");
        } else if (data.transaction) {
          const updated = data.transaction as ProcurementTransaction;
          setTransactions((prev) =>
            prev.map((t) =>
              t.transactionId === updated.transactionId ? updated : t
            )
          );
          setSelectedTx(updated);
        }
      } catch (err: unknown) {
        setBannerError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setBusyTxId(null);
      }
    },
    []
  );

  const handleBatchAction = useCallback(
    async (
      action: "BATCH_APPROVE" | "BATCH_FREEZE",
      transactionIds: string[]
    ) => {
      setBannerError(null);
      const res = await fetch("/api/procurement/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, transactionIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerError(data.error || "Batch action failed");
      } else if (Array.isArray(data.transactions)) {
        const map = new Map<string, ProcurementTransaction>(
          data.transactions.map((t: ProcurementTransaction) => [
            t.transactionId,
            t,
          ])
        );
        setTransactions((prev) =>
          prev.map((t) => map.get(t.transactionId) || t)
        );
      }
    },
    []
  );

  const handleSavePayPalCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCreds(true);
    setCredModalError(null);
    try {
      const res = await fetch("/api/paypal/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientIdInput,
          clientSecret: clientSecretInput,
          persistToEnvLocal: persistEnv,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCredModalError(data.error || "Could not verify PayPal Sandbox keys");
      } else {
        setPaypalInfo(data);
        setShowCredModal(false);
        setClientIdInput("");
        setClientSecretInput("");
      }
    } catch (err: unknown) {
      setCredModalError(
        err instanceof Error ? err.message : "Failed to save credentials"
      );
    } finally {
      setSavingCreds(false);
    }
  };

  const handleTriggerWebhookEvent = async (eventType: string) => {
    const targetTxId =
      selectedTx?.transactionId || transactions[0]?.transactionId;
    await fetch("/api/paypal/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `WH-SANDBOX-${Date.now().toString().slice(-6)}`,
        event_type: eventType,
        transactionId: targetTxId,
        summary: `PayPal Sandbox Webhook ${eventType} synchronized for ${
          targetTxId || "active order"
        }.`,
      }),
    });
  };

  // Summary metrics
  const totalEscrowAuthorized = transactions
    .filter(
      (t) =>
        t.paypal.status === "AUTHORIZED" ||
        t.paypal.status === "CAPTURED" ||
        t.paypal.status === "PARTIALLY_CAPTURED_AND_INVOICED"
    )
    .reduce((acc, t) => acc + t.rfq.totalAmountUsd, 0);

  const totalSettledUsd = transactions
    .filter(
      (t) =>
        t.paypal.status === "CAPTURED" ||
        t.paypal.status === "PARTIALLY_CAPTURED_AND_INVOICED"
    )
    .reduce((acc, t) => acc + (t.paypal.capturedAmountUsd || 0), 0);

  const blockedAnomaliesCount = transactions.filter(
    (t) =>
      t.currentState === "HUMAN_APPROVAL_QUEUE" ||
      t.currentState === "FROZEN_BY_COMPLIANCE"
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F4F0] text-black">
      {/* Gumroad-Inspired Neo-Brutalist Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b-2 border-black px-6 py-3.5">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#FF90E8] border-2 border-black flex items-center justify-center shadow-brutal-sm">
              <Shield className="w-6 h-6 text-black stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black tracking-tight text-black">
                  AegisAgent
                </h1>
                <span className="gumroad-badge bg-[#FFC900] text-black">
                  AUTONOMOUS PROCUREMENT
                </span>
              </div>
              <p className="text-xs font-semibold text-neutral-700">
                Deterministic Multi-Agent Governance • Dual-Key Merkle Audit •
                PayPal v2 Settlement • AG Grid Flight Deck
              </p>
            </div>
          </div>

          {/* Right Status Pills & Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 3-Min /brag Demo Video Studio Link */}
            <Link
              href="/demo"
              className="gumroad-btn px-3.5 py-1.5 bg-[#FFC900] hover:bg-[#FF90E8] text-black text-xs flex items-center gap-1.5"
            >
              <Film className="w-3.5 h-3.5" />
              3-Min /brag Demo Video
            </Link>

            {/* SSE Telemetry Badge */}
            <div className="px-3 py-1.5 rounded-full bg-[#F4F4F0] border-2 border-black flex items-center gap-2 text-xs font-bold shadow-brutal-sm">
              <span
                className={`w-2.5 h-2.5 rounded-full border border-black ${
                  sseConnected
                    ? "bg-[#23A094] animate-pulse"
                    : "bg-[#FFC900]"
                }`}
              />
              <span className="font-mono">
                SSE: {sseConnected ? "LIVE STREAM" : "CONNECTING"}
              </span>
            </div>

            {/* PayPal Sandbox Credential Status & Configuration Trigger */}
            <button
              onClick={() => setShowCredModal(true)}
              className={`gumroad-btn px-3.5 py-1.5 text-xs flex items-center gap-2 ${
                paypalInfo.authenticated ? "bg-[#98F5E1]" : "bg-[#FF90E8]"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              {paypalInfo.authenticated ? (
                <span>
                  PayPal Sandbox Connected ({paypalInfo.maskedClientId})
                </span>
              ) : (
                <span>Configure PayPal Sandbox Keys</span>
              )}
            </button>

            {/* Webhook Simulator Triggers */}
            <div className="flex items-center gap-1.5 bg-white border-2 border-black rounded-lg p-1 shadow-brutal-sm">
              <button
                onClick={() =>
                  handleTriggerWebhookEvent("PAYMENT.AUTHORIZATION.CREATED")
                }
                className="px-2.5 py-1 rounded border border-transparent hover:border-black hover:bg-[#90E0EF] text-[11px] font-mono font-bold text-black flex items-center gap-1 transition"
                title="Dispatch PayPal Webhook PAYMENT.AUTHORIZATION.CREATED"
              >
                <Webhook className="w-3 h-3" />
                WH:Auth
              </button>
              <button
                onClick={() =>
                  handleTriggerWebhookEvent("CUSTOMER.DISPUTE.CREATED")
                }
                className="px-2.5 py-1 rounded border border-transparent hover:border-black hover:bg-[#FF7051] text-[11px] font-mono font-bold text-black flex items-center gap-1 transition"
                title="Dispatch PayPal Webhook CUSTOMER.DISPUTE.CREATED"
              >
                WH:Dispute
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6 space-y-6">
        {/* Gumroad Editorial Hero Strip */}
        <section className="gumroad-card bg-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF90E8] border-2 border-black text-xs font-black shadow-brutal-sm">
              <Sparkles className="w-3.5 h-3.5" />
              ZERO-HALLUCINATION AGENTIC COMMERCE
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight text-black">
              Go from unformatted vendor RFQ to{" "}
              <span className="inline-block bg-[#FFC900] px-2.5 py-0.5 border-2 border-black rounded-lg shadow-brutal-sm -rotate-1">
                programmable PayPal settlement.
              </span>
            </h2>
            <p className="text-sm font-medium text-neutral-700 leading-relaxed">
              Every autonomous transaction is normalized via Zod, screened for
              prompt-injection &amp;{" "}
              <span className="font-mono font-bold bg-[#F4F4F0] px-1.5 py-0.5 border border-black rounded">
                &gt;15%
              </span>{" "}
              price anomalies, countersigned in a Dual-Key SHA-256 Merkle chain,
              and settled via APIMatic-validated PayPal v2 Orders, Invoicing,
              and Multi-Tier Payouts.
            </p>
          </div>

          {/* 4 Color-Blocked Gumroad KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
            <div className="bg-[#90E0EF] border-2 border-black rounded-xl p-3.5 shadow-brutal-sm min-w-[135px]">
              <div className="text-[11px] font-black uppercase flex items-center justify-between">
                <span>Active RFQs</span>
                <Layers className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black font-mono mt-1">
                {transactions.length}
              </div>
              <div className="text-[10px] font-bold mt-0.5">Merkle-Chained</div>
            </div>

            <div className="bg-[#FF90E8] border-2 border-black rounded-xl p-3.5 shadow-brutal-sm min-w-[145px]">
              <div className="text-[11px] font-black uppercase flex items-center justify-between">
                <span>PayPal Escrow</span>
                <DollarSign className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black font-mono mt-1">
                ${totalEscrowAuthorized.toLocaleString()}
              </div>
              <div className="text-[10px] font-bold mt-0.5">
                intent: AUTHORIZE
              </div>
            </div>

            <div className="bg-[#98F5E1] border-2 border-black rounded-xl p-3.5 shadow-brutal-sm min-w-[145px]">
              <div className="text-[11px] font-black uppercase flex items-center justify-between">
                <span>Settled USD</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black font-mono mt-1">
                ${totalSettledUsd.toLocaleString()}
              </div>
              <div className="text-[10px] font-bold mt-0.5">
                Captured &amp; Paid
              </div>
            </div>

            <div className="bg-[#FFC900] border-2 border-black rounded-xl p-3.5 shadow-brutal-sm min-w-[135px]">
              <div className="text-[11px] font-black uppercase flex items-center justify-between">
                <span>Held / Gate</span>
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black font-mono mt-1">
                {blockedAnomaliesCount}
              </div>
              <div className="text-[10px] font-bold mt-0.5">
                Human Approval
              </div>
            </div>
          </div>
        </section>

        {/* Alert Banner if PayPal Sandbox keys are not yet configured */}
        {!paypalInfo.authenticated && (
          <div className="gumroad-card bg-[#FFC900] px-5 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs sm:text-sm font-bold text-black">
              <AlertOctagon className="w-6 h-6 text-black shrink-0" />
              <div>
                <span className="font-black underline">
                  Strict PayPal Sandbox Mode Active:
                </span>{" "}
                {paypalInfo.message ||
                  "Provide your PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to execute live /v2/checkout/orders, /v2/invoicing/invoices, and /v1/payments/payouts calls. Until configured, transactions route safely to HUMAN_APPROVAL_QUEUE."}
              </div>
            </div>
            <button
              onClick={() => setShowCredModal(true)}
              className="gumroad-btn px-4 py-2 bg-black text-white hover:bg-[#FF90E8] hover:text-black text-xs shrink-0"
            >
              Enter PayPal Sandbox Credentials →
            </button>
          </div>
        )}

        {bannerError && (
          <div className="gumroad-card bg-[#FF7051] px-4 py-3 flex items-center justify-between text-xs font-bold text-black">
            <span>{bannerError}</span>
            <button
              onClick={() => setBannerError(null)}
              className="p-1 rounded border border-black bg-white hover:bg-[#FFC900]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Deterministic State Machine Graph Visualizer */}
        <section className="gumroad-card bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="font-black text-sm text-black flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              STEP 1: DETERMINISTIC STATE MACHINE GRAPH (LANGGRAPH / ZERO SILENT
              FAILURES)
            </span>
            <span className="gumroad-badge bg-[#FFC900] text-black font-mono">
              Fallback Gate: HUMAN_APPROVAL_QUEUE (
              {
                transactions.filter(
                  (t) => t.currentState === "HUMAN_APPROVAL_QUEUE"
                ).length
              }
              )
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
            {STATE_PIPELINE_ORDER.map((st, idx) => {
              const count = transactions.filter(
                (t) => t.currentState === st
              ).length;
              return (
                <div
                  key={st}
                  className={`rounded-xl p-3 border-2 border-black font-mono text-xs flex flex-col justify-between transition ${
                    count > 0
                      ? "bg-[#FF90E8] shadow-brutal-sm"
                      : "bg-[#F4F4F0]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] bg-white px-1.5 py-0.2 rounded border border-black">
                      0{idx + 1}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-black border border-black ${
                        count > 0 ? "bg-black text-white" : "bg-white text-black"
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                  <div className="truncate font-black mt-2 text-[11px]" title={st}>
                    {st}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Interactive Enterprise Scenario Launchpad (Gumroad Product Card Style) */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="gumroad-badge bg-[#FF90E8] text-black">
                LIVE MULTI-AGENT TESTBENCH
              </span>
              <h2 className="text-lg font-black text-black">
                Autonomous Procurement Scenario Launchpad
              </h2>
            </div>
            <span className="text-xs font-bold text-neutral-700">
              Click any card to ingest an RFQ through Agent 1, Agent 2, Solver,
              Dual-Key HSM &amp; PayPal Sandbox v2
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {scenarios.map((sc) => {
              const isRunning = busyScenarioId === sc.id;
              const isThreat = sc.id === "SCENARIO_PROMPT_INJECTION";
              const isAnomaly = sc.id === "SCENARIO_PRICE_ANOMALY";
              const isPartial = sc.id === "SCENARIO_PARTIAL_DELIVERY_INVOICE";

              const headerRibbonBg = isThreat
                ? "bg-[#FF7051]"
                : isAnomaly
                ? "bg-[#FFC900]"
                : isPartial
                ? "bg-[#B8A9FF]"
                : "bg-[#98F5E1]";

              return (
                <div
                  key={sc.id}
                  className="gumroad-card overflow-hidden flex flex-col justify-between transition-transform hover:-translate-y-1"
                >
                  <div>
                    {/* Gumroad Card Top Color Header */}
                    <div
                      className={`${headerRibbonBg} border-b-2 border-black px-4 py-2.5 flex items-center justify-between`}
                    >
                      <span className="font-mono text-[10px] font-black uppercase tracking-wider text-black">
                        {sc.badge}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-white border-2 border-black font-mono text-xs font-black shadow-brutal-sm">
                        ${sc.rfq.totalAmountUsd.toLocaleString()}
                      </span>
                    </div>

                    <div className="p-4">
                      <h3 className="text-sm font-black text-black mb-1.5 leading-snug">
                        {sc.title}
                      </h3>
                      <p className="text-xs font-medium text-neutral-700 leading-relaxed">
                        {sc.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="px-4 py-3 bg-[#F4F4F0] border-t-2 border-black flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-bold text-black truncate">
                      {sc.rfq.vendorName} ({sc.rfq.incoterms})
                    </span>
                    <button
                      disabled={Boolean(busyScenarioId)}
                      onClick={() => handleRunScenario(sc.id)}
                      className="gumroad-btn px-3.5 py-1.5 bg-[#FF90E8] hover:bg-[#FFC900] text-black text-xs flex items-center gap-1.5 shrink-0"
                    >
                      {isRunning ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Ingest RFQ
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Step 3: AG Grid Enterprise Operational Flight Deck */}
        <section className="gumroad-card overflow-hidden">
          <FlightDeckGrid
            transactions={transactions}
            busyTxId={busyTxId}
            onTriggerAction={handleGridAction}
            onBatchAction={handleBatchAction}
            onSelectTransactionForInspector={(tx) => setSelectedTx(tx)}
          />
        </section>

        {/* Bottom Split Telemetry & Deep Cryptographic/APIMatic Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Real-Time SSE Telemetry Stream */}
          <div className="lg:col-span-5 gumroad-card p-5 flex flex-col h-[400px]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#23A094] animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider text-black">
                  Live SSE Execution &amp; Webhook Stream
                </h3>
              </div>
              <span className="gumroad-badge bg-[#98F5E1] font-mono text-[10px]">
                {sseEvents.length} events
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 font-mono text-[11px]">
              {sseEvents.length === 0 ? (
                <div className="text-neutral-600 font-medium py-10 text-center bg-[#F4F4F0] rounded-xl border-2 border-dashed border-black">
                  Click &quot;Ingest RFQ&quot; on any scenario card above to
                  stream real-time multi-agent state transitions and PayPal
                  Sandbox API calls into the Flight Deck.
                </div>
              ) : (
                sseEvents.map((ev) => (
                  <div
                    key={ev.eventId}
                    className="p-2.5 rounded-xl bg-[#F4F4F0] border-2 border-black flex flex-col gap-1 shadow-brutal-sm"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold px-1.5 py-0.2 rounded bg-[#FF90E8] border border-black text-black">
                        {ev.type} • {ev.transactionId}
                      </span>
                      <span className="font-bold text-neutral-700">
                        {new Date(ev.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="text-black font-semibold leading-snug mt-0.5">
                      {ev.summary}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Selected Transaction Deep Inspector + APIMatic Spec Registry */}
          <div className="lg:col-span-7 gumroad-card p-5 flex flex-col h-[400px] overflow-hidden">
            <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-black">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-black" />
                <h3 className="text-xs font-black uppercase tracking-wider text-black">
                  {selectedTx
                    ? `Deep Audit Inspector: ${selectedTx.transactionId} (${selectedTx.rfq.vendorName})`
                    : "APIMatic Strict OpenAPI Tool Bindings for PayPal v2"}
                </h3>
              </div>
              {selectedTx && (
                <span className="gumroad-badge bg-[#FFC900] font-mono text-[10px]">
                  {selectedTx.currentState}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {selectedTx ? (
                <>
                  {/* Dual-Key & Merkle Chain Proof */}
                  <div className="p-3.5 rounded-xl bg-[#F4F4F0] border-2 border-black font-mono text-[11px] space-y-1 shadow-brutal-sm">
                    <div className="font-black text-black flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4 fill-[#98F5E1]" />
                      Immutable Dual-Key Cryptographic Action Log (Block #
                      {selectedTx.dualKey.merkleIndex})
                    </div>
                    <div className="text-neutral-700 truncate">
                      Prev Merkle Hash: {selectedTx.dualKey.previousMerkleHash}
                    </div>
                    <div className="font-bold text-black truncate">
                      Curr Merkle Hash: {selectedTx.dualKey.currentMerkleHash}
                    </div>
                    <div className="text-neutral-700 truncate">
                      Agent HMAC-SHA256: {selectedTx.dualKey.agentSignature}
                    </div>
                    <div className="font-bold truncate">
                      Human Countersig:{" "}
                      <span className="bg-[#FFC900] px-1 rounded border border-black">
                        {selectedTx.dualKey.humanSignature ||
                          "PENDING_CFO_COMPLIANCE_KEY"}
                      </span>
                    </div>
                  </div>

                  {/* Raw Vendor Quote & Threat Scan */}
                  <div className="p-3.5 rounded-xl bg-[#F4F4F0] border-2 border-black space-y-1.5 shadow-brutal-sm">
                    <div className="font-black text-black flex items-center justify-between">
                      <span>Raw Vendor Quote &amp; Threat Modeler Output</span>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded-full border border-black font-bold ${
                          selectedTx.threatModel.passed
                            ? "bg-[#98F5E1]"
                            : "bg-[#FF7051]"
                        }`}
                      >
                        Threat Score: {selectedTx.threatModel.threatScore}/100
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-black bg-white p-2.5 rounded-lg border-2 border-black">
                      {selectedTx.rfq.rawSourcePreview}
                    </div>
                  </div>

                  {/* PayPal API Call Payloads */}
                  <div className="p-3.5 rounded-xl bg-[#F4F4F0] border-2 border-black space-y-2 shadow-brutal-sm">
                    <div className="font-black text-black flex items-center justify-between">
                      <span>
                        APIMatic-Validated PayPal Sandbox HTTP Payloads (
                        {selectedTx.paypal.apiTraces.length})
                      </span>
                      {selectedTx.paypal.approvalUrl && (
                        <a
                          href={selectedTx.paypal.approvalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="gumroad-btn px-2.5 py-1 bg-[#FF90E8] text-black flex items-center gap-1 text-[11px]"
                        >
                          Open Sandbox Order Link{" "}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {selectedTx.paypal.apiTraces.map((tr) => (
                      <div
                        key={tr.callId}
                        className="p-2.5 rounded-lg bg-white border-2 border-black font-mono text-[10px] space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold text-black">
                          <span className="bg-[#98F5E1] px-1.5 py-0.5 rounded border border-black">
                            {tr.method} {tr.endpoint} ({tr.apimaticOperationId})
                          </span>
                          <span>
                            HTTP {tr.httpStatus} • {tr.latencyMs}ms
                          </span>
                        </div>
                        <pre className="text-black overflow-x-auto max-h-28 pt-1">
                          {JSON.stringify(tr.responsePayload, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-2.5">
                  {apimaticOps.map((op) => (
                    <div
                      key={op.operationId}
                      className="p-3 rounded-xl bg-[#F4F4F0] border-2 border-black flex flex-col gap-1 shadow-brutal-sm"
                    >
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="font-black text-black flex items-center gap-1.5">
                          <Code2 className="w-4 h-4" />
                          {op.endpoint}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#98F5E1] border border-black">
                          {op.openApiSpecVersion}
                        </span>
                      </div>
                      <p className="text-neutral-700 font-medium text-[11px]">
                        {op.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Gumroad Neo-Brutalist PayPal Sandbox Credentials Modal */}
      {showCredModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border-2 border-black p-6 shadow-brutal-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#FF90E8] border-2 border-black flex items-center justify-center shadow-brutal-sm">
                  <KeyRound className="w-5 h-5 text-black" />
                </div>
                <h2 className="text-lg font-black text-black">
                  PayPal Sandbox API Credentials
                </h2>
              </div>
              <button
                onClick={() => setShowCredModal(false)}
                className="p-1 rounded-lg border-2 border-black bg-[#F4F4F0] hover:bg-[#FF7051]"
              >
                <X className="w-4 h-4 text-black" />
              </button>
            </div>

            <p className="text-xs font-medium text-neutral-700 leading-relaxed">
              AegisAgent connects directly to{" "}
              <code className="font-mono font-bold bg-[#F4F4F0] px-1.5 py-0.5 border border-black rounded">
                https://api-m.sandbox.paypal.com
              </code>{" "}
              for OAuth2 token exchange, Orders v2 (
              <code className="font-mono font-bold bg-[#FFC900] px-1 py-0.5 border border-black rounded">
                intent: &quot;AUTHORIZE&quot;
              </code>
              ), Captures, Invoicing v2, and Multi-Tier Batch Payouts.
            </p>

            {credModalError && (
              <div className="p-3 rounded-xl bg-[#FF7051] border-2 border-black text-xs font-bold text-black shadow-brutal-sm">
                {credModalError}
              </div>
            )}

            <form onSubmit={handleSavePayPalCredentials} className="space-y-3.5">
              <div>
                <label className="block text-xs font-mono font-black text-black mb-1">
                  PAYPAL_CLIENT_ID
                </label>
                <input
                  type="text"
                  required
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  placeholder="Enter PayPal Sandbox Client ID..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F4F0] border-2 border-black text-xs font-mono font-bold text-black focus:outline-none focus:bg-white shadow-brutal-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-black text-black mb-1">
                  PAYPAL_CLIENT_SECRET
                </label>
                <input
                  type="password"
                  required
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                  placeholder="Enter PayPal Sandbox Client Secret..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F4F0] border-2 border-black text-xs font-mono font-bold text-black focus:outline-none focus:bg-white shadow-brutal-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-black cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={persistEnv}
                  onChange={(e) => setPersistEnv(e.target.checked)}
                  className="w-4 h-4 rounded border-2 border-black accent-[#FF90E8]"
                />
                Persist credentials to workspace <code>.env.local</code>
              </label>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t-2 border-black">
                <button
                  type="button"
                  onClick={() => setShowCredModal(false)}
                  className="gumroad-btn px-4 py-2 bg-[#F4F4F0] text-black text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCreds}
                  className="gumroad-btn px-5 py-2 bg-[#FF90E8] hover:bg-[#FFC900] text-black text-xs"
                >
                  {savingCreds
                    ? "Verifying with PayPal OAuth2..."
                    : "Verify & Connect Sandbox →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
