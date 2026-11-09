import {
  ComplianceRiskReport,
  ConstraintSolverResult,
  StrictRFQ,
  ThreatDetectionResult,
} from "@/types/aegis";

const AUTONOMOUS_TIER_1_CEILING_USD = 25000.0;

/**
 * Deterministic Constraint Solver (Cost vs. Delivery vs. SLA Optimization)
 * Computes a formal multi-objective utility score:
 *   U = 0.45 * S_cost + 0.30 * S_delivery + 0.25 * S_sla
 * Enforces Role-Based ACL budget limits and compliance gates.
 */
export function runDeterministicConstraintSolver(
  rfq: StrictRFQ,
  threat: ThreatDetectionResult,
  compliance: ComplianceRiskReport
): ConstraintSolverResult {
  // Cost score: 100 when at or below baseline, penalizes positive deviation
  const deviationRatio =
    (rfq.totalAmountUsd - rfq.baselineTotalUsd) / rfq.baselineTotalUsd;
  const costScore = Math.max(
    0,
    Math.min(100, Math.round(100 - Math.max(0, deviationRatio * 220)))
  );

  // Delivery score: faster lead times score higher (target <= 14 days)
  const deliveryScore = Math.max(
    20,
    Math.min(100, Math.round(100 - Math.max(0, (rfq.leadTimeDays - 5) * 4)))
  );

  // SLA score: maps historical SLA reliability (80%..100% -> 0..100)
  const slaScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(((compliance.historicalSlaReliability - 80) / 20) * 100)
    )
  );

  const compositeUtilityScore = Number(
    (0.45 * costScore + 0.3 * deliveryScore + 0.25 * slaScore).toFixed(1)
  );

  const withinBudgetCeiling = rfq.totalAmountUsd <= AUTONOMOUS_TIER_1_CEILING_USD;

  const feasible =
    threat.passed &&
    compliance.passed &&
    withinBudgetCeiling &&
    compositeUtilityScore >= 70;

  let recommendation: ConstraintSolverResult["recommendation"] =
    "AUTO_EXECUTE_PAYPAL_AUTH";

  if (!threat.passed || compliance.sanctionsMatch) {
    recommendation = "REJECT_TERMINAL";
  } else if (!feasible) {
    recommendation = "ROUTE_TO_HUMAN_QUEUE";
  }

  const solverProofFormula = `U = 0.45(${costScore}) + 0.30(${deliveryScore}) + 0.25(${slaScore}) = ${compositeUtilityScore}/100 | Ceiling: $${rfq.totalAmountUsd.toLocaleString()} <= $${AUTONOMOUS_TIER_1_CEILING_USD.toLocaleString()} (${
    withinBudgetCeiling ? "PASS" : "FAIL"
  })`;

  return {
    feasible,
    compositeUtilityScore,
    costScore,
    deliveryScore,
    slaScore,
    budgetCeilingUsd: AUTONOMOUS_TIER_1_CEILING_USD,
    withinBudgetCeiling,
    roleAclPolicy: "ACL-ROLE-AUTONOMOUS-BUYER-TIER-1 (Max $25,000 / <=15% Variance)",
    solverProofFormula,
    recommendation,
  };
}
