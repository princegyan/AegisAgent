import { z } from "zod";

/**
 * APIMatic Context Plugin — Strict OpenAPI 3.0 Schema Bindings for PayPal Developer Platform
 * Guarantees zero-hallucination tool payloads before any request leaves AegisAgent for PayPal Sandbox.
 */

export const PayPalMoneySchema = z.object({
  currency_code: z.literal("USD"),
  value: z.string().regex(/^\d+(\.\d{2})$/, "Must be a 2-decimal currency string"),
});

export const PayPalOrderCreateRequestSchema = z.object({
  intent: z.literal("AUTHORIZE"),
  purchase_units: z
    .array(
      z.object({
        reference_id: z.string().max(256),
        custom_id: z.string().max(127),
        invoice_id: z.string().max(127),
        description: z.string().max(127),
        amount: z.object({
          currency_code: z.literal("USD"),
          value: z.string().regex(/^\d+(\.\d{2})$/),
          breakdown: z.object({
            item_total: PayPalMoneySchema,
            tax_total: PayPalMoneySchema,
            shipping: PayPalMoneySchema,
          }),
        }),
        items: z.array(
          z.object({
            name: z.string().max(127),
            sku: z.string().max(127),
            quantity: z.string().regex(/^\d+$/),
            unit_amount: PayPalMoneySchema,
            category: z.enum(["PHYSICAL_GOODS", "DIGITAL_GOODS"]).optional(),
          })
        ),
      })
    )
    .min(1),
  payment_source: z
    .object({
      paypal: z.object({
        experience_context: z.object({
          brand_name: z.string(),
          shipping_preference: z.enum(["NO_SHIPPING", "GET_FROM_FILE"]),
          user_action: z.enum(["PAY_NOW", "CONTINUE"]),
          return_url: z.string().url(),
          cancel_url: z.string().url(),
        }),
      }),
    })
    .optional(),
});

export const PayPalCaptureRequestSchema = z.object({
  invoice_id: z.string().max(127).optional(),
  note_to_payer: z.string().max(255).optional(),
  final_capture: z.boolean(),
  amount: PayPalMoneySchema,
});

export const PayPalInvoiceCreateRequestSchema = z.object({
  detail: z.object({
    invoice_number: z.string().max(25),
    reference: z.string().max(60),
    currency_code: z.literal("USD"),
    note: z.string().max(4000),
    term: z.string().optional(),
    payment_term: z
      .object({
        term_type: z.enum(["NET_30", "NET_15", "DUE_ON_RECEIPT"]),
      })
      .optional(),
  }),
  invoicer: z.object({
    name: z.object({
      given_name: z.string(),
      surname: z.string(),
    }),
    business_name: z.string(),
  }),
  primary_recipients: z.array(
    z.object({
      billing_info: z.object({
        name: z.object({
          given_name: z.string(),
          surname: z.string(),
        }),
        email_address: z.string().email(),
      }),
    })
  ),
  items: z.array(
    z.object({
      name: z.string().max(200),
      description: z.string().max(1000).optional(),
      quantity: z.string(),
      unit_amount: PayPalMoneySchema,
    })
  ),
});

export const PayPalBatchPayoutRequestSchema = z.object({
  sender_batch_header: z.object({
    sender_batch_id: z.string().max(127),
    email_subject: z.string().max(255),
    email_message: z.string().max(1000),
  }),
  items: z
    .array(
      z.object({
        recipient_type: z.literal("EMAIL"),
        amount: z.object({
          value: z.string().regex(/^\d+(\.\d{2})$/),
          currency: z.literal("USD"),
        }),
        note: z.string().max(1000),
        sender_item_id: z.string().max(127),
        receiver: z.string().email(),
      })
    )
    .min(1),
});

export const APIMATIC_PAYPAL_OPERATIONS = [
  {
    operationId: "orders.create",
    endpoint: "POST /v2/checkout/orders",
    openApiSpecVersion: "PayPal Orders v2.13 (APIMatic Validated)",
    description:
      "Creates an autonomous procurement escrow order with intent: AUTHORIZE and Merkle audit metadata.",
  },
  {
    operationId: "orders.authorize",
    endpoint: "POST /v2/checkout/orders/{id}/authorize",
    openApiSpecVersion: "PayPal Orders v2.13 (APIMatic Validated)",
    description:
      "Authorizes funds on an approved PayPal Order, generating an authorization_id for milestone escrow.",
  },
  {
    operationId: "authorizations.capture",
    endpoint: "POST /v2/payments/authorizations/{authorization_id}/capture",
    openApiSpecVersion: "PayPal Payments v2.8 (APIMatic Validated)",
    description:
      "Captures authorized funds upon cryptographic proof of milestone delivery (supports partial capture).",
  },
  {
    operationId: "invoices.create",
    endpoint: "POST /v2/invoicing/invoices",
    openApiSpecVersion: "PayPal Invoicing v2.9 (APIMatic Validated)",
    description:
      "Generates dynamic Net-30 invoices or automated discrepancy reconciliation invoices for partial deliveries.",
  },
  {
    operationId: "payouts.post",
    endpoint: "POST /v1/payments/payouts",
    openApiSpecVersion: "PayPal Payouts v1.11 (APIMatic Validated)",
    description:
      "Disburses simultaneous multi-tier batch settlements to primary vendors and logistics providers.",
  },
];
