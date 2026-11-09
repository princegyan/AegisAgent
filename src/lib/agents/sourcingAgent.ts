import {
  StrictRFQ,
  StrictRFQSchema,
  ThreatDetectionResult,
} from "@/types/aegis";

const PROMPT_INJECTION_PATTERNS: { pattern: RegExp; label: string; weight: number }[] = [
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
    label: "DIRECTIVE_OVERRIDE_INJECTION",
    weight: 60,
  },
  {
    pattern: /pay\s+\$?\s*\d{1,3}(,\d{3})+(\.\d{2})?\s*(immediately|wire|to)/i,
    label: "UNAUTHORIZED_PAYMENT_DIVERSION",
    weight: 45,
  },
  {
    pattern: /system\s*prompt|override\s+policy|bypass\s+(kyc|compliance|approval|escrow)/i,
    label: "GOVERNANCE_BYPASS_ATTEMPT",
    weight: 55,
  },
  {
    pattern: /<!--[\s\S]*?(ignore|pay|transfer|override)[\s\S]*?-->/i,
    label: "HIDDEN_HTML_COMMENT_PAYLOAD",
    weight: 50,
  },
  {
    pattern: /[\u200B-\u200D\uFEFF]/,
    label: "ZERO_WIDTH_STEGANOGRAPHY_CHARS",
    weight: 40,
  },
];

/**
 * Agent 1: Sourcing & Catalog Extraction Agent
 * 1. Scans raw vendor input / quote text for adversarial prompt injection attacks.
 * 2. Normalizes line items, tax liabilities, shipping terms (Incoterms), and lead times
 *    into the strict Zod schema (StrictRFQSchema).
 */
export function runPromptInjectionScanner(rawText: string): ThreatDetectionResult {
  const detectedPatterns: string[] = [];
  let threatScore = 0;

  for (const rule of PROMPT_INJECTION_PATTERNS) {
    if (rule.pattern.test(rawText)) {
      detectedPatterns.push(rule.label);
      threatScore += rule.weight;
    }
  }

  threatScore = Math.min(100, threatScore);
  const passed = threatScore < 30 && detectedPatterns.length === 0;

  const sanitizedExcerpt = rawText
    .replace(/<!--[\s\S]*?-->/g, "[REDACTED_HTML_INJECTION]")
    .replace(
      /ignore\s+(all\s+)?(previous|prior|above)\s+instructions[^.\n]*/gi,
      "[REDACTED_PROMPT_INJECTION_PAYLOAD]"
    )
    .slice(0, 500);

  const analysisSummary = passed
    ? "Zero adversarial prompt-injection signatures detected across lexical, HTML-comment, and zero-width Unicode channels."
    : `CRITICAL THREAT BLOCKED (Score ${threatScore}/100): Adversarial payload detected [${detectedPatterns.join(
        ", "
      )}]. Execution halted and routed to Human Security Queue.`;

  return {
    passed,
    threatScore,
    detectedPatterns,
    sanitizedExcerpt,
    analysisSummary,
  };
}

export function validateAndNormalizeRFQ(candidate: unknown): {
  success: boolean;
  data?: StrictRFQ;
  errors?: string[];
  threatModel: ThreatDetectionResult;
} {
  const rawPreview =
    typeof candidate === "object" &&
    candidate !== null &&
    "rawSourcePreview" in candidate &&
    typeof (candidate as { rawSourcePreview: unknown }).rawSourcePreview === "string"
      ? (candidate as { rawSourcePreview: string }).rawSourcePreview
      : JSON.stringify(candidate);

  const threatModel = runPromptInjectionScanner(rawPreview);
  const parsed = StrictRFQSchema.safeParse(candidate);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`
      ),
      threatModel,
    };
  }

  return {
    success: true,
    data: parsed.data,
    threatModel,
  };
}
