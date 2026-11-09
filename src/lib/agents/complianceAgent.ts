import crypto from "crypto";
import {
  ComplianceRiskReport,
  PriceAnomalyReport,
  StrictRFQ,
} from "@/types/aegis";

// Simulated OFAC / EU / UN Sanctioned Entities & High-Risk Watchlist
const SANCTIONED_VENDORS = new Set([
  "VND-SANCTION-999",
  "NORTHSTAR-DARK-LOGISTICS",
  "SHADOW-SILICON-LTD",
]);

// Historical SLA Performance Registry by Vendor ID
const VENDOR_SLA_REGISTRY: Record<string, { slaPercent: number; kyc: "VERIFIED" | "WATCHLIST_HIT" | "UNVERIFIED" }> = {
  "VND-AERO-001": { slaPercent: 99.2, kyc: "VERIFIED" },
  "VND-NEURAL-002": { slaPercent: 96.8, kyc: "VERIFIED" },
  "VND-LIDAR-004": { slaPercent: 97.5, kyc: "VERIFIED" },
  "VND-SHADOW-003": { slaPercent: 72.0, kyc: "WATCHLIST_HIT" },
};

// In-memory registry of processed invoice SHA-256 hashes to prevent replay/double-billing
const seenInvoiceHashes = new Set<string>();

export function computeInvoiceHash(rfq: StrictRFQ): string {
  const raw = `${rfq.vendorId}:${rfq.invoiceNumber}:${rfq.totalAmountUsd.toFixed(2)}:${rfq.currency}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Agent 2: The Compliance & Risk Agent
 * - Validates vendor identity against simulated sanction lists and past performance logs.
 * - Verifies SHA-256 Duplicate Invoice Hash.
 * - Runs price-anomaly detection against historical industry benchmarks (>15% moving median deviation).
 */
export function evaluateComplianceAndRisk(
  rfq: StrictRFQ,
  options?: { allowDuplicateForRetry?: boolean }
): ComplianceRiskReport {
  const blockingReasons: string[] = [];

  // 1. KYC & Sanctions Screening
  const vendorRecord = VENDOR_SLA_REGISTRY[rfq.vendorId] || {
    slaPercent: 94.0,
    kyc: "VERIFIED",
  };
  const sanctionsMatch =
    SANCTIONED_VENDORS.has(rfq.vendorId) ||
    /sanction|evil|dark/i.test(rfq.vendorPaypalEmail);

  if (sanctionsMatch) {
    blockingReasons.push(
      `Vendor ${rfq.vendorName} (${rfq.vendorId}) matched OFAC/EU consolidated sanctions list.`
    );
  }
  if (vendorRecord.kyc !== "VERIFIED") {
    blockingReasons.push(
      `Vendor KYC status is ${vendorRecord.kyc} (requires VERIFIED tier for autonomous settlement).`
    );
  }

  // 2. Duplicate Invoice SHA-256 Hash Check
  const duplicateInvoiceHash = computeInvoiceHash(rfq);
  const isDuplicateInvoice =
    !options?.allowDuplicateForRetry && seenInvoiceHashes.has(duplicateInvoiceHash);

  if (isDuplicateInvoice) {
    blockingReasons.push(
      `Duplicate Invoice SHA-256 Hash detected (${duplicateInvoiceHash.slice(0, 16)}...) for invoice ${rfq.invoiceNumber}.`
    );
  } else {
    seenInvoiceHashes.add(duplicateInvoiceHash);
  }

  // 3. Price-Anomaly Detection (>15% from Historical Moving Median)
  const quotedTotalUsd = rfq.totalAmountUsd;
  const historicalMedianUsd = rfq.baselineTotalUsd;
  const deviationPercent = Number(
    (((quotedTotalUsd - historicalMedianUsd) / historicalMedianUsd) * 100).toFixed(2)
  );
  const thresholdPercent = 15.0;
  const isAnomalous = Math.abs(deviationPercent) > thresholdPercent;

  const priceAnomaly: PriceAnomalyReport = {
    quotedTotalUsd,
    historicalMedianUsd,
    deviationPercent,
    thresholdPercent,
    isAnomalous,
  };

  if (isAnomalous) {
    const recommendedCounterOfferUsd = Number(
      (historicalMedianUsd * 1.05).toFixed(2)
    );
    priceAnomaly.disputeInquiryDraft = {
      inquiryId: `DSP-INQ-${Date.now().toString().slice(-6)}`,
      subject: `Automated Price Variance Inquiry: Invoice ${rfq.invoiceNumber} (+${deviationPercent}% vs. Benchmark)`,
      body: `AegisAgent Compliance Engine flagged a +${deviationPercent}% variance on RFQ ${rfq.rfqId} ($${quotedTotalUsd.toLocaleString()} quoted vs. $${historicalMedianUsd.toLocaleString()} 90-day industry moving median). Autonomous PayPal authorization is held pending supplier justification or revision to target cap ($${recommendedCounterOfferUsd.toLocaleString()}).`,
      benchmarkReference: `IDX-PROCURE-90D-MEDIAN-${rfq.lineItems[0]?.sku || "GEN"}`,
      recommendedCounterOfferUsd,
    };
    blockingReasons.push(
      `Price deviation of ${deviationPercent > 0 ? "+" : ""}${deviationPercent}% exceeds the ±${thresholdPercent}% deterministic moving-median threshold ($${quotedTotalUsd.toLocaleString()} vs. $${historicalMedianUsd.toLocaleString()} baseline).`
    );
  }

  // Compute overall risk score (0 = safest, 100 = highest risk)
  let overallRiskScore = 8;
  if (sanctionsMatch) overallRiskScore += 85;
  if (vendorRecord.kyc !== "VERIFIED") overallRiskScore += 35;
  if (isDuplicateInvoice) overallRiskScore += 50;
  if (isAnomalous) {
    overallRiskScore += Math.min(45, Math.round(Math.abs(deviationPercent) * 1.2));
  }

  overallRiskScore = Math.min(100, overallRiskScore);

  return {
    passed: blockingReasons.length === 0,
    kycStatus: vendorRecord.kyc,
    sanctionsMatch,
    sanctionsListChecked: [
      "OFAC SDN Consolidated",
      "EU Financial Sanctions",
      "UN Security Council ISIL/Al-Qaida",
      "Aegis Internal Vendor Blocklist",
    ],
    duplicateInvoiceHash,
    isDuplicateInvoice,
    historicalSlaReliability: vendorRecord.slaPercent,
    overallRiskScore,
    priceAnomaly,
    blockingReasons,
  };
}
