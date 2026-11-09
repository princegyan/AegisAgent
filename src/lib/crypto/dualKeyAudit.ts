import crypto from "crypto";
import { DualKeySignature } from "@/types/aegis";

const AGENT_ROOT_SECRET =
  process.env.AEGIS_AGENT_SIGNING_KEY ||
  "aegis-autonomous-agent-root-key-v1-9f8e7d6c5b4a";

const HUMAN_APPROVER_SECRET =
  process.env.AEGIS_HUMAN_APPROVER_KEY ||
  "aegis-cfo-compliance-approver-key-v1-1a2b3c4d5e6f";

/**
 * Generates a deterministic SHA-256 hex digest from canonicalized JSON data.
 */
export function sha256Canonical(payload: unknown): string {
  const canonical = JSON.stringify(payload, Object.keys(payload as object).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Generates an HMAC-SHA256 signature for agent or human dual-key authorization.
 */
export function hmacSign(digest: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(digest).digest("hex");
}

/**
 * Creates the initial Agent cryptographic signature and chains it to the Merkle audit log.
 */
export function createAgentDualKeySignature(params: {
  merkleIndex: number;
  previousMerkleHash: string;
  transactionId: string;
  rfqDigest: string;
  solverScore: number;
  autoApproveWithinPolicy: boolean;
}): DualKeySignature {
  const now = new Date().toISOString();
  const canonicalPayload = {
    transactionId: params.transactionId,
    rfqDigest: params.rfqDigest,
    solverScore: params.solverScore,
    previousMerkleHash: params.previousMerkleHash,
    timestamp: now,
  };

  const payloadCanonicalDigest = sha256Canonical(canonicalPayload);
  const agentSignature = hmacSign(payloadCanonicalDigest, AGENT_ROOT_SECRET);

  // If the transaction passes deterministic policy without human exception,
  // the Policy Engine issues a delegated policy countersignature; otherwise it awaits human key.
  let humanApproverId: string | undefined;
  let humanSignature: string | undefined;
  let humanSignedAt: string | undefined;
  let dualKeyVerified = false;

  if (params.autoApproveWithinPolicy) {
    humanApproverId = "AEGIS-POLICY-ACL-DELEGATION-TIER-1";
    humanSignature = hmacSign(
      `${payloadCanonicalDigest}:${agentSignature}:AUTO_POLICY`,
      HUMAN_APPROVER_SECRET
    );
    humanSignedAt = now;
    dualKeyVerified = true;
  }

  const currentMerkleHash = crypto
    .createHash("sha256")
    .update(
      `${params.previousMerkleHash}:${payloadCanonicalDigest}:${agentSignature}:${
        humanSignature || "PENDING_HUMAN_KEY"
      }`
    )
    .digest("hex");

  return {
    merkleIndex: params.merkleIndex,
    previousMerkleHash: params.previousMerkleHash,
    currentMerkleHash,
    agentKeyId: "AEGIS-AGENT-ED25519-HSM-01",
    agentSignature,
    agentSignedAt: now,
    humanApproverId,
    humanSignature,
    humanSignedAt,
    dualKeyVerified,
    payloadCanonicalDigest,
  };
}

/**
 * Applies a Human Compliance Officer cryptographic countersignature to unlock a held transaction.
 */
export function countersignHumanApproval(
  existing: DualKeySignature,
  approverId: string = "CFO-COMPLIANCE-OFFICER-KEY-01"
): DualKeySignature {
  const now = new Date().toISOString();
  const humanSignature = hmacSign(
    `${existing.payloadCanonicalDigest}:${existing.agentSignature}:${approverId}`,
    HUMAN_APPROVER_SECRET
  );

  const currentMerkleHash = crypto
    .createHash("sha256")
    .update(
      `${existing.previousMerkleHash}:${existing.payloadCanonicalDigest}:${existing.agentSignature}:${humanSignature}`
    )
    .digest("hex");

  return {
    ...existing,
    humanApproverId: approverId,
    humanSignature,
    humanSignedAt: now,
    dualKeyVerified: true,
    currentMerkleHash,
  };
}
