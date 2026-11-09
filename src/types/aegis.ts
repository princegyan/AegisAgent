import { z } from "zod";

export type ProcurementState =
  | "RFQ_INGESTED"
  | "SCHEMA_VALIDATED"
  | "RISK_SCORED"
  | "PAYPAL_AUTH_CREATED"
  | "DELIVERY_VERIFIED"
  | "PAYPAL_CAPTURED"
  | "DISPUTED_INVOICED"
  | "HUMAN_APPROVAL_QUEUE"
  | "FROZEN_BY_COMPLIANCE";

export const STATE_PIPELINE_ORDER: ProcurementState[] = [
  "RFQ_INGESTED",
  "SCHEMA_VALIDATED",
  "RISK_SCORED",
  "PAYPAL_AUTH_CREATED",
  "DELIVERY_VERIFIED",
  "PAYPAL_CAPTURED",
];

export const IncotermSchema = z.enum(["FOB", "CIF", "DDP", "EXW", "DAP"]);

export const NormalizedLineItemSchema = z.object({
  sku: z.string().min(2),
  description: z.string().min(3),
  quantityOrdered: z.number().int().positive(),
  quantityDelivered: z.number().int().nonnegative().optional(),
  unitPriceUsd: z.number().positive(),
  baselineUnitPriceUsd: z.number().positive(),
  subtotalUsd: z.number().positive(),
  category: z.string(),
});

export const StrictRFQSchema = z.object({
  rfqId: z.string().min(3),
  vendorId: z.string().min(2),
  vendorName: z.string().min(2),
  vendorPaypalEmail: z.string().email(),
  logisticsProviderEmail: z.string().email().optional(),
  invoiceNumber: z.string().min(3),
  currency: z.literal("USD"),
  incoterms: IncotermSchema,
  leadTimeDays: z.number().int().positive(),
  slaTargetPercent: z.number().min(80).max(100),
  lineItems: z.array(NormalizedLineItemSchema).min(1),
  subtotalUsd: z.number().positive(),
  taxRatePercent: z.number().min(0).max(30),
  taxAmountUsd: z.number().nonnegative(),
  shippingAmountUsd: z.number().nonnegative(),
  logisticsFeeUsd: z.number().nonnegative(),
  totalAmountUsd: z.number().positive(),
  baselineTotalUsd: z.number().positive(),
  paymentTerms: z.enum(["MILESTONE_ESCROW", "NET_30", "IMMEDIATE_AUTH"]),
  rawSourcePreview: z.string(),
});

export type StrictRFQ = z.infer<typeof StrictRFQSchema>;
export type NormalizedLineItem = z.infer<typeof NormalizedLineItemSchema>;

export interface ThreatDetectionResult {
  passed: boolean;
  threatScore: number; // 0 to 100
  detectedPatterns: string[];
  sanitizedExcerpt: string;
  analysisSummary: string;
}

export interface PriceAnomalyReport {
  quotedTotalUsd: number;
  historicalMedianUsd: number;
  deviationPercent: number;
  thresholdPercent: number; // 15%
  isAnomalous: boolean;
  disputeInquiryDraft?: {
    inquiryId: string;
    subject: string;
    body: string;
    benchmarkReference: string;
    recommendedCounterOfferUsd: number;
  };
}

export interface ComplianceRiskReport {
  passed: boolean;
  kycStatus: "VERIFIED" | "WATCHLIST_HIT" | "UNVERIFIED";
  sanctionsMatch: boolean;
  sanctionsListChecked: string[];
  duplicateInvoiceHash: string;
  isDuplicateInvoice: boolean;
  historicalSlaReliability: number; // e.g., 98.4%
  overallRiskScore: number; // 0 (lowest risk) to 100 (highest risk)
  priceAnomaly: PriceAnomalyReport;
  blockingReasons: string[];
}

export interface ConstraintSolverResult {
  feasible: boolean;
  compositeUtilityScore: number; // 0 to 100
  costScore: number;
  deliveryScore: number;
  slaScore: number;
  budgetCeilingUsd: number;
  withinBudgetCeiling: boolean;
  roleAclPolicy: string;
  solverProofFormula: string;
  recommendation: "AUTO_EXECUTE_PAYPAL_AUTH" | "ROUTE_TO_HUMAN_QUEUE" | "REJECT_TERMINAL";
}

export interface DualKeySignature {
  merkleIndex: number;
  previousMerkleHash: string;
  currentMerkleHash: string;
  agentKeyId: string;
  agentSignature: string;
  agentSignedAt: string;
  humanApproverId?: string;
  humanSignature?: string;
  humanSignedAt?: string;
  dualKeyVerified: boolean;
  payloadCanonicalDigest: string;
}

export interface PayPalApiCallTrace {
  callId: string;
  timestamp: string;
  apimaticOperationId: string;
  method: "POST" | "GET" | "PATCH";
  endpoint: string;
  httpStatus: number;
  latencyMs: number;
  schemaValidationPassed: boolean;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  paypalResourceId?: string;
  approvalUrl?: string;
  errorMessage?: string;
}

export interface AgentReasoningStep {
  stepId: string;
  timestamp: string;
  agentName:
    | "AEGIS_POLICY_ENGINE"
    | "AGENT_1_SOURCING_MULTIMODAL"
    | "AGENT_2_COMPLIANCE_RISK"
    | "CONSTRAINT_SOLVER"
    | "DUAL_KEY_CRYPTO_GUARD"
    | "AGENT_3_PAYPAL_SETTLEMENT"
    | "PAYPAL_WEBHOOK_ENGINE";
  stateBefore: ProcurementState;
  stateAfter: ProcurementState;
  thought: string;
  confidence: number;
  tokensUsed: number;
  tokenCostUsd: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface ProcurementTransaction {
  transactionId: string;
  createdAt: string;
  updatedAt: string;
  currentState: ProcurementState;
  stateHistory: {
    state: ProcurementState;
    timestamp: string;
    actor: string;
    note: string;
  }[];
  rfq: StrictRFQ;
  threatModel: ThreatDetectionResult;
  compliance: ComplianceRiskReport;
  solver: ConstraintSolverResult;
  dualKey: DualKeySignature;
  agentConfidence: number;
  totalTokensUsed: number;
  totalTokenCostUsd: number;
  paypal: {
    status:
      | "PENDING_AUTH"
      | "ORDER_CREATED_AWAITING_APPROVAL"
      | "AUTHORIZED"
      | "PARTIALLY_CAPTURED_AND_INVOICED"
      | "CAPTURED"
      | "PAYOUT_DISBURSED"
      | "DISPUTED"
      | "FROZEN"
      | "API_ERROR";
    orderId?: string;
    authorizationId?: string;
    captureId?: string;
    invoiceId?: string;
    invoiceNumber?: string;
    payoutBatchId?: string;
    approvalUrl?: string;
    authorizedAmountUsd?: number;
    capturedAmountUsd?: number;
    discrepancyCreditMemoUsd?: number;
    vendorNetPayoutUsd?: number;
    logisticsPayoutUsd?: number;
    lastError?: string;
    apiTraces: PayPalApiCallTrace[];
    webhookEvents: {
      eventId: string;
      eventType: string;
      receivedAt: string;
      summary: string;
      payload: Record<string, unknown>;
    }[];
  };
  reasoningTrace: AgentReasoningStep[];
  deliveryVerification?: {
    verifiedAt: string;
    orderedUnits: number;
    deliveredUnits: number;
    fillRatePercent: number;
    SignedWaybillHash: string;
    isPartialDelivery: boolean;
  };
}

export interface TelemetrySSEEvent {
  eventId: string;
  timestamp: string;
  type:
    | "TRANSACTION_CREATED"
    | "TRANSACTION_UPDATED"
    | "AGENT_REASONING_STEP"
    | "PAYPAL_API_CALL"
    | "WEBHOOK_RECEIVED"
    | "BATCH_ACTION_EXECUTED";
  transactionId: string;
  summary: string;
  transaction?: ProcurementTransaction;
}
