// Minimal PayPal REST client for one-time credit pack checkout (Orders v2).
// PayPal is optional: when the env vars are unset the UI hides the button and
// the API routes return 503, so deploys without a PayPal account are inert.

const PAYPAL_API_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

// The webhook id is required, not optional: eCheck settlements and
// abandoned-redirect recovery only work through the (signature-verified)
// webhook, so taking money without it risks paid-but-never-credited orders.
export function isPaypalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID &&
      process.env.PAYPAL_CLIENT_SECRET &&
      process.env.PAYPAL_WEBHOOK_ID
  );
}

// Access tokens live ~9 hours; cache per lambda instance, refresh 60s early.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  }

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal token request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

async function paypalFetch(
  path: string,
  init: {
    method: string;
    body?: unknown;
    // Pre-serialized JSON sent byte-for-byte (webhook verification needs the
    // delivered body verbatim — re-serializing can change bytes and fail it).
    rawJsonBody?: string;
    requestId?: string;
  }
): Promise<Response> {
  const token = await getAccessToken();

  const body =
    init.rawJsonBody !== undefined
      ? init.rawJsonBody
      : init.body !== undefined
        ? JSON.stringify(init.body)
        : undefined;

  return fetch(`${PAYPAL_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // PayPal replays the original response for a repeated request id, so
      // retries can't create duplicate orders.
      ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
    },
    ...(body !== undefined ? { body } : {}),
  });
}

export interface PaypalOrderResult {
  id: string;
  status: string;
  approveUrl: string | null;
  captureId: string | null;
  capturedUsdCents: number | null;
  // Capture that exists but hasn't settled (eCheck/review). Persisted so the
  // later PAYMENT.CAPTURE.COMPLETED event can be correlated back to the order.
  pendingCaptureId: string | null;
}

interface PaypalOrderResponse {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: {
    payments?: {
      captures?: { id: string; status: string; amount?: { value?: string } }[];
    };
  }[];
}

function toOrderResult(order: PaypalOrderResponse): PaypalOrderResult {
  const approveUrl =
    order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")
      ?.href ?? null;

  // Only a COMPLETED capture is settled money — PENDING (eCheck/review) must
  // wait for the PAYMENT.CAPTURE.COMPLETED webhook.
  const captures = order.purchase_units?.[0]?.payments?.captures ?? [];
  const capture = captures.find((c) => c.status === "COMPLETED");
  const pendingCapture = capture ? null : captures[0];

  return {
    id: order.id,
    status: order.status,
    approveUrl,
    captureId: capture?.id ?? null,
    capturedUsdCents: capture?.amount?.value
      ? Math.round(parseFloat(capture.amount.value) * 100)
      : null,
    pendingCaptureId: pendingCapture?.id ?? null,
  };
}

export async function createPaypalOrder(params: {
  amountUsdCents: number;
  description: string;
  userId: string;
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
}): Promise<PaypalOrderResult> {
  const res = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    requestId: params.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: (params.amountUsdCents / 100).toFixed(2),
          },
          description: params.description,
          custom_id: params.userId,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Greenroom",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: params.returnUrl,
            cancel_url: params.cancelUrl,
          },
        },
      },
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal create order failed (${res.status}): ${body}`);
  }

  return toOrderResult((await res.json()) as PaypalOrderResponse);
}

export async function getPaypalOrder(
  orderId: string
): Promise<PaypalOrderResult> {
  const res = await paypalFetch(`/v2/checkout/orders/${orderId}`, {
    method: "GET",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PayPal get order failed (${res.status}): ${body}`);
  }

  return toOrderResult((await res.json()) as PaypalOrderResponse);
}

// Capture failures that retrying can never fix — callers should stop
// (webhook: ack 200 so PayPal quits redelivering) instead of erroring.
const TERMINAL_CAPTURE_ISSUES = [
  "INSTRUMENT_DECLINED",
  "PAYER_CANNOT_PAY",
  "ORDER_NOT_APPROVED",
  "ORDER_EXPIRED",
  "TRANSACTION_REFUSED",
  "PAYEE_BLOCKED_TRANSACTION",
  "PAYER_ACCOUNT_RESTRICTED",
  "PAYER_ACCOUNT_LOCKED_OR_CLOSED",
  "COMPLIANCE_VIOLATION",
];

export class PaypalCaptureError extends Error {
  terminal: boolean;

  constructor(message: string, terminal: boolean) {
    super(message);
    this.name = "PaypalCaptureError";
    this.terminal = terminal;
  }
}

export async function capturePaypalOrder(
  orderId: string
): Promise<PaypalOrderResult> {
  const res = await paypalFetch(`/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    body: {},
  });

  if (res.ok) {
    return toOrderResult((await res.json()) as PaypalOrderResponse);
  }

  // The webhook and the return redirect can both try to capture; the loser
  // gets ORDER_ALREADY_CAPTURED. Fetch the order and settle from its state.
  if (res.status === 422) {
    const body = await res.text();
    if (body.includes("ORDER_ALREADY_CAPTURED")) {
      return getPaypalOrder(orderId);
    }
    throw new PaypalCaptureError(
      `PayPal capture failed (422): ${body}`,
      TERMINAL_CAPTURE_ISSUES.some((issue) => body.includes(issue))
    );
  }

  const body = await res.text();
  throw new PaypalCaptureError(
    `PayPal capture failed (${res.status}): ${body}`,
    false
  );
}

/**
 * Verify a webhook delivery against PayPal's verification endpoint.
 * Fails closed: missing PAYPAL_WEBHOOK_ID or any non-SUCCESS status → false.
 */
export async function verifyPaypalWebhook(params: {
  headers: Headers;
  rawBody: string;
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("PAYPAL_WEBHOOK_ID is not set — rejecting webhook");
    return false;
  }

  const transmissionId = params.headers.get("paypal-transmission-id");
  const transmissionTime = params.headers.get("paypal-transmission-time");
  const transmissionSig = params.headers.get("paypal-transmission-sig");
  const certUrl = params.headers.get("paypal-cert-url");
  const authAlgo = params.headers.get("paypal-auth-algo");

  if (
    !transmissionId ||
    !transmissionTime ||
    !transmissionSig ||
    !certUrl ||
    !authAlgo
  ) {
    return false;
  }

  // PayPal signs the CRC32 of the raw delivered bytes, and documents that the
  // webhook_event must be "posted back exactly as it was received" — a
  // JSON.parse/stringify round-trip can change bytes (whitespace, \uXXXX
  // escapes, number formatting) and fail verification. Splice the raw body in
  // verbatim instead of re-serializing it.
  const rawJsonBody =
    `{"webhook_id":${JSON.stringify(webhookId)},` +
    `"transmission_id":${JSON.stringify(transmissionId)},` +
    `"transmission_time":${JSON.stringify(transmissionTime)},` +
    `"transmission_sig":${JSON.stringify(transmissionSig)},` +
    `"cert_url":${JSON.stringify(certUrl)},` +
    `"auth_algo":${JSON.stringify(authAlgo)},` +
    `"webhook_event":${params.rawBody}}`;

  const res = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    rawJsonBody,
  });

  if (!res.ok) {
    console.error(`PayPal webhook verification request failed (${res.status})`);
    return false;
  }

  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}
