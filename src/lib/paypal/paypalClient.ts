import {
  PayPalBatchPayoutRequestSchema,
  PayPalCaptureRequestSchema,
  PayPalInvoiceCreateRequestSchema,
  PayPalOrderCreateRequestSchema,
} from "@/lib/paypal/apimaticBindings";
import { PayPalApiCallTrace, StrictRFQ } from "@/types/aegis";

interface RuntimeCredentials {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

// Runtime credential store allowing either .env.local or live UI credential injection
let runtimeOverride: Partial<RuntimeCredentials> = {};

export function setRuntimePayPalCredentials(creds: {
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
}) {
  runtimeOverride = {
    ...runtimeOverride,
    ...creds,
  };
}

export function getPayPalCredentials(): RuntimeCredentials {
  const clientId = (
    runtimeOverride.clientId ||
    process.env.PAYPAL_CLIENT_ID ||
    ""
  ).trim();
  const clientSecret = (
    runtimeOverride.clientSecret ||
    process.env.PAYPAL_CLIENT_SECRET ||
    ""
  ).trim();
  const baseUrl = (
    runtimeOverride.baseUrl ||
    process.env.PAYPAL_API_BASE_URL ||
    "https://api-m.sandbox.paypal.com"
  ).trim();

  return { clientId, clientSecret, baseUrl };
}

export function isPayPalConfigured(): boolean {
  const { clientId, clientSecret } = getPayPalCredentials();
  return (
    Boolean(clientId) &&
    Boolean(clientSecret) &&
    clientId !== "your_paypal_sandbox_client_id_here" &&
    clientSecret !== "your_paypal_sandbox_client_secret_here"
  );
}

/**
 * Obtains a fresh OAuth 2.0 Bearer token from PayPal Sandbox (/v1/oauth2/token).
 */
export async function getPayPalAccessToken(): Promise<{
  accessToken: string;
  baseUrl: string;
  appId?: string;
  expiresIn?: number;
}> {
  const { clientId, clientSecret, baseUrl } = getPayPalCredentials();

  if (!isPayPalConfigured()) {
    throw new Error(
      "Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET. Configure credentials in .env.local or via the 'PayPal Sandbox Keys' button in the top navigation bar."
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(
      `PayPal OAuth2 Token Exchange failed (HTTP ${response.status}): ${
        (data.error_description as string) ||
        (data.message as string) ||
        JSON.stringify(data)
      }`
    );
  }

  return {
    accessToken: data.access_token,
    baseUrl,
    appId: data.app_id as string | undefined,
    expiresIn: data.expires_in as number | undefined,
  };
}

/**
 * Step 2.1: POST /v2/checkout/orders (with intent: "AUTHORIZE")
 */
export async function createPayPalAuthorizeOrder(
  rfq: StrictRFQ,
  merkleHash: string
): Promise<{
  trace: PayPalApiCallTrace;
  orderId?: string;
  approvalUrl?: string;
  status?: string;
}> {
  const startTime = Date.now();
  const itemTotal = rfq.lineItems.reduce(
    (acc, item) => acc + item.quantityOrdered * item.unitPriceUsd,
    0
  );
  const taxTotal = rfq.taxAmountUsd;
  const shippingTotal = Number(
    (rfq.shippingAmountUsd + rfq.logisticsFeeUsd).toFixed(2)
  );
  const computedTotal = Number((itemTotal + taxTotal + shippingTotal).toFixed(2));

  const rawPayload = {
    intent: "AUTHORIZE" as const,
    purchase_units: [
      {
        reference_id: rfq.rfqId.slice(0, 64),
        custom_id: `AEGIS:${merkleHash.slice(0, 48)}`,
        invoice_id: `${rfq.invoiceNumber}-${Date.now().toString().slice(-5)}`,
        description: `AegisAgent Autonomous Procurement: ${rfq.vendorName} (${rfq.incoterms})`,
        amount: {
          currency_code: "USD" as const,
          value: computedTotal.toFixed(2),
          breakdown: {
            item_total: {
              currency_code: "USD" as const,
              value: itemTotal.toFixed(2),
            },
            tax_total: {
              currency_code: "USD" as const,
              value: taxTotal.toFixed(2),
            },
            shipping: {
              currency_code: "USD" as const,
              value: shippingTotal.toFixed(2),
            },
          },
        },
        items: rfq.lineItems.map((li) => ({
          name: li.description.slice(0, 120),
          sku: li.sku.slice(0, 64),
          quantity: String(li.quantityOrdered),
          unit_amount: {
            currency_code: "USD" as const,
            value: li.unitPriceUsd.toFixed(2),
          },
          category: "PHYSICAL_GOODS" as const,
        })),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "AegisAgent Enterprise Control Plane",
          shipping_preference: "NO_SHIPPING" as const,
          user_action: "PAY_NOW" as const,
          return_url: "http://localhost:3000/?paypal_return=true",
          cancel_url: "http://localhost:3000/?paypal_cancel=true",
        },
      },
    },
  };

  // Validate against APIMatic strict OpenAPI schema before sending
  const validation = PayPalOrderCreateRequestSchema.safeParse(rawPayload);
  if (!validation.success) {
    throw new Error(
      `APIMatic Schema Validation Failed on orders.create: ${validation.error.message}`
    );
  }

  const { accessToken, baseUrl } = await getPayPalAccessToken();
  const requestId = `aegis-order-${rfq.rfqId}-${Date.now()}`;

  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
      Prefer: "return=representation",
    },
    body: JSON.stringify(validation.data),
    cache: "no-store",
  });

  const responseData = (await response.json()) as Record<string, unknown>;
  const latencyMs = Date.now() - startTime;

  const links = Array.isArray(responseData.links)
    ? (responseData.links as { href: string; rel: string }[])
    : [];
  const approvalLink = links.find(
    (l) => l.rel === "payer-action" || l.rel === "approve"
  )?.href;

  const trace: PayPalApiCallTrace = {
    callId: `PP-CALL-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    apimaticOperationId: "orders.create",
    method: "POST",
    endpoint: "/v2/checkout/orders",
    httpStatus: response.status,
    latencyMs,
    schemaValidationPassed: true,
    requestPayload: validation.data as unknown as Record<string, unknown>,
    responsePayload: responseData,
    paypalResourceId: responseData.id as string | undefined,
    approvalUrl: approvalLink,
    errorMessage: !response.ok
      ? ((responseData.message as string) || "PayPal orders.create error")
      : undefined,
  };

  if (!response.ok) {
    throw Object.assign(
      new Error(
        `PayPal POST /v2/checkout/orders failed (${response.status}): ${
          (responseData.message as string) || JSON.stringify(responseData)
        }`
      ),
      { trace }
    );
  }

  return {
    trace,
    orderId: responseData.id as string,
    approvalUrl: approvalLink,
    status: responseData.status as string,
  };
}

/**
 * Step 2.2: POST /v2/checkout/orders/{id}/authorize
 */
export async function authorizePayPalOrder(orderId: string): Promise<{
  trace: PayPalApiCallTrace;
  authorizationId?: string;
  status?: string;
}> {
  const startTime = Date.now();
  const { accessToken, baseUrl } = await getPayPalAccessToken();

  const response = await fetch(
    `${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `aegis-auth-${orderId}-${Date.now()}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    }
  );

  const responseData = (await response.json()) as Record<string, unknown>;
  const latencyMs = Date.now() - startTime;

  // Extract authorization_id if present in purchase_units[0].payments.authorizations[0].id
  let authorizationId: string | undefined;
  try {
    const pu = (responseData.purchase_units as Record<string, unknown>[])?.[0];
    const payments = pu?.payments as Record<string, unknown> | undefined;
    const auths = payments?.authorizations as Record<string, unknown>[] | undefined;
    authorizationId = auths?.[0]?.id as string | undefined;
  } catch {
    // ignore
  }

  const trace: PayPalApiCallTrace = {
    callId: `PP-CALL-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    apimaticOperationId: "orders.authorize",
    method: "POST",
    endpoint: `/v2/checkout/orders/${orderId}/authorize`,
    httpStatus: response.status,
    latencyMs,
    schemaValidationPassed: true,
    requestPayload: { order_id: orderId },
    responsePayload: responseData,
    paypalResourceId: authorizationId || orderId,
    errorMessage: !response.ok
      ? ((responseData.message as string) || "Order requires buyer approval in Sandbox before authorize")
      : undefined,
  };

  return {
    trace,
    authorizationId,
    status: responseData.status as string | undefined,
  };
}

/**
 * Step 2.3: POST /v2/payments/authorizations/{authorization_id}/capture
 */
export async function capturePayPalAuthorization(params: {
  authorizationId: string;
  captureAmountUsd: number;
  invoiceId: string;
  finalCapture: boolean;
  noteToPayer: string;
}): Promise<{
  trace: PayPalApiCallTrace;
  captureId?: string;
  status?: string;
}> {
  const startTime = Date.now();
  const payload = {
    invoice_id: params.invoiceId.slice(0, 120),
    note_to_payer: params.noteToPayer.slice(0, 250),
    final_capture: params.finalCapture,
    amount: {
      currency_code: "USD" as const,
      value: params.captureAmountUsd.toFixed(2),
    },
  };

  const validation = PayPalCaptureRequestSchema.safeParse(payload);
  if (!validation.success) {
    throw new Error(
      `APIMatic Schema Validation Failed on authorizations.capture: ${validation.error.message}`
    );
  }

  const { accessToken, baseUrl } = await getPayPalAccessToken();
  const response = await fetch(
    `${baseUrl}/v2/payments/authorizations/${encodeURIComponent(
      params.authorizationId
    )}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `aegis-cap-${params.authorizationId}-${Date.now()}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(validation.data),
      cache: "no-store",
    }
  );

  const responseData = (await response.json()) as Record<string, unknown>;
  const latencyMs = Date.now() - startTime;

  const trace: PayPalApiCallTrace = {
    callId: `PP-CALL-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    apimaticOperationId: "authorizations.capture",
    method: "POST",
    endpoint: `/v2/payments/authorizations/${params.authorizationId}/capture`,
    httpStatus: response.status,
    latencyMs,
    schemaValidationPassed: true,
    requestPayload: validation.data as unknown as Record<string, unknown>,
    responsePayload: responseData,
    paypalResourceId: responseData.id as string | undefined,
    errorMessage: !response.ok
      ? ((responseData.message as string) || "Capture API error")
      : undefined,
  };

  return {
    trace,
    captureId: responseData.id as string | undefined,
    status: responseData.status as string | undefined,
  };
}

/**
 * Step 2.4: POST /v2/invoicing/invoices
 * Creates a real PayPal Sandbox v2 Invoice for Automated Discrepancy Invoicing (e.g. 80 of 100 units delivered)
 * or Dynamic Net-30 Procurement Reconciliation.
 */
export async function createPayPalDiscrepancyInvoice(params: {
  rfq: StrictRFQ;
  orderedUnits: number;
  deliveredUnits: number;
  shortfallAmountUsd: number;
  adjustedPayableUsd: number;
  merkleHash: string;
}): Promise<{
  trace: PayPalApiCallTrace;
  invoiceId?: string;
  invoiceNumber: string;
}> {
  const startTime = Date.now();
  const invoiceNumber = `REC-${Date.now().toString().slice(-8)}`;
  const shortfallUnits = Math.max(0, params.orderedUnits - params.deliveredUnits);

  const rawPayload = {
    detail: {
      invoice_number: invoiceNumber,
      reference: `${params.rfq.rfqId}-DISCREPANCY`,
      currency_code: "USD" as const,
      note: `AegisAgent Automated Discrepancy Reconciliation Memo: ${params.deliveredUnits}/${params.orderedUnits} units verified at receiving dock (${shortfallUnits} unit shortfall = -$${params.shortfallAmountUsd.toFixed(
        2
      )} credit adjustment). Merkle Proof: ${params.merkleHash.slice(0, 32)}`,
      payment_term: {
        term_type: "NET_30" as const,
      },
    },
    invoicer: {
      name: {
        given_name: "AegisAgent",
        surname: "Autonomous Treasury",
      },
      business_name: "Aegis Enterprise Procurement Control Plane",
    },
    primary_recipients: [
      {
        billing_info: {
          name: {
            given_name: params.rfq.vendorName.split(" ")[0] || "Vendor",
            surname: "Accounts Receivable",
          },
          email_address: params.rfq.vendorPaypalEmail,
        },
      },
    ],
    items: [
      {
        name: `Reconciled Delivery (${params.deliveredUnits}/${params.orderedUnits} units): ${
          params.rfq.lineItems[0]?.description || params.rfq.rfqId
        }`.slice(0, 190),
        description: `Partial delivery settlement after deducting ${shortfallUnits} missing units (-$${params.shortfallAmountUsd.toFixed(
          2
        )} discrepancy memo).`,
        quantity: "1",
        unit_amount: {
          currency_code: "USD" as const,
          value: params.adjustedPayableUsd.toFixed(2),
        },
      },
    ],
  };

  const validation = PayPalInvoiceCreateRequestSchema.safeParse(rawPayload);
  if (!validation.success) {
    throw new Error(
      `APIMatic Schema Validation Failed on invoices.create: ${validation.error.message}`
    );
  }

  const { accessToken, baseUrl } = await getPayPalAccessToken();
  const response = await fetch(`${baseUrl}/v2/invoicing/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `aegis-inv-${invoiceNumber}-${Date.now()}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(validation.data),
    cache: "no-store",
  });

  const responseData = (await response.json()) as Record<string, unknown>;
  const latencyMs = Date.now() - startTime;

  // PayPal Invoicing v2 returns either { id: "INV2-..." } or an href ending with the invoice ID
  let invoiceId = responseData.id as string | undefined;
  if (!invoiceId && typeof responseData.href === "string") {
    const parts = responseData.href.split("/");
    invoiceId = parts[parts.length - 1];
  }

  const trace: PayPalApiCallTrace = {
    callId: `PP-CALL-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    apimaticOperationId: "invoices.create",
    method: "POST",
    endpoint: "/v2/invoicing/invoices",
    httpStatus: response.status,
    latencyMs,
    schemaValidationPassed: true,
    requestPayload: validation.data as unknown as Record<string, unknown>,
    responsePayload: responseData,
    paypalResourceId: invoiceId,
    errorMessage: !response.ok
      ? ((responseData.message as string) || "Invoicing API v2 error")
      : undefined,
  };

  if (!response.ok) {
    throw Object.assign(
      new Error(
        `PayPal POST /v2/invoicing/invoices failed (${response.status}): ${
          (responseData.message as string) || JSON.stringify(responseData)
        }`
      ),
      { trace }
    );
  }

  return {
    trace,
    invoiceId,
    invoiceNumber,
  };
}

/**
 * Step 2.5: POST /v1/payments/payouts
 * Batch Multi-Tier Payouts: Simultaneously disburses fulfillment fees to logistics providers
 * and net payouts to vendors.
 */
export async function executePayPalMultiTierBatchPayout(params: {
  rfq: StrictRFQ;
  vendorNetAmountUsd: number;
  logisticsFeeUsd: number;
  merkleHash: string;
}): Promise<{
  trace: PayPalApiCallTrace;
  payoutBatchId?: string;
  batchStatus?: string;
}> {
  const startTime = Date.now();
  const senderBatchId = `AEGIS_BATCH_${params.rfq.rfqId}_${Date.now()}`;

  const items = [
    {
      recipient_type: "EMAIL" as const,
      amount: {
        value: params.vendorNetAmountUsd.toFixed(2),
        currency: "USD" as const,
      },
      note: `AegisAgent Net Vendor Settlement for RFQ ${params.rfq.rfqId} (Merkle: ${params.merkleHash.slice(
        0,
        16
      )})`,
      sender_item_id: `${params.rfq.rfqId}_VENDOR_NET`,
      receiver: params.rfq.vendorPaypalEmail,
    },
  ];

  if (params.logisticsFeeUsd > 0) {
    items.push({
      recipient_type: "EMAIL" as const,
      amount: {
        value: params.logisticsFeeUsd.toFixed(2),
        currency: "USD" as const,
      },
      note: `AegisAgent Multi-Tier Logistics & Freight Fulfillment Fee (${params.rfq.incoterms}) for RFQ ${params.rfq.rfqId}`,
      sender_item_id: `${params.rfq.rfqId}_LOGISTICS_FEE`,
      receiver:
        params.rfq.logisticsProviderEmail ||
        "freight-escrow-sandbox@aegis-logistics.io",
    });
  }

  const rawPayload = {
    sender_batch_header: {
      sender_batch_id: senderBatchId.slice(0, 120),
      email_subject: `AegisAgent Autonomous Settlement Disbursed (${params.rfq.rfqId})`,
      email_message: `Your multi-tier procurement payout has been cryptographically verified and disbursed by AegisAgent.`,
    },
    items,
  };

  const validation = PayPalBatchPayoutRequestSchema.safeParse(rawPayload);
  if (!validation.success) {
    throw new Error(
      `APIMatic Schema Validation Failed on payouts.post: ${validation.error.message}`
    );
  }

  const { accessToken, baseUrl } = await getPayPalAccessToken();
  const response = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validation.data),
    cache: "no-store",
  });

  const responseData = (await response.json()) as Record<string, unknown>;
  const latencyMs = Date.now() - startTime;

  const batchHeader = responseData.batch_header as
    | Record<string, unknown>
    | undefined;
  const payoutBatchId = batchHeader?.payout_batch_id as string | undefined;
  const batchStatus = batchHeader?.batch_status as string | undefined;

  const trace: PayPalApiCallTrace = {
    callId: `PP-CALL-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    apimaticOperationId: "payouts.post",
    method: "POST",
    endpoint: "/v1/payments/payouts",
    httpStatus: response.status,
    latencyMs,
    schemaValidationPassed: true,
    requestPayload: validation.data as unknown as Record<string, unknown>,
    responsePayload: responseData,
    paypalResourceId: payoutBatchId,
    errorMessage: !response.ok
      ? ((responseData.message as string) || "PayPal Payouts API error")
      : undefined,
  };

  if (!response.ok) {
    throw Object.assign(
      new Error(
        `PayPal POST /v1/payments/payouts failed (${response.status}): ${
          (responseData.message as string) || JSON.stringify(responseData)
        }`
      ),
      { trace }
    );
  }

  return {
    trace,
    payoutBatchId,
    batchStatus,
  };
}
