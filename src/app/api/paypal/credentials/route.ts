import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  getPayPalAccessToken,
  getPayPalCredentials,
  isPayPalConfigured,
  setRuntimePayPalCredentials,
} from "@/lib/paypal/paypalClient";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isPayPalConfigured();
  const { clientId, baseUrl } = getPayPalCredentials();

  if (!configured) {
    return NextResponse.json({
      configured: false,
      baseUrl,
      maskedClientId: null,
      message:
        "PayPal Sandbox credentials not yet configured. Click 'PayPal Sandbox Keys' in the header or add PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET to .env.local.",
    });
  }

  try {
    const tokenInfo = await getPayPalAccessToken();
    return NextResponse.json({
      configured: true,
      authenticated: true,
      baseUrl: tokenInfo.baseUrl,
      appId: tokenInfo.appId,
      maskedClientId: `${clientId.slice(0, 8)}...${clientId.slice(-4)}`,
      message: `Connected to PayPal Sandbox (${tokenInfo.baseUrl})`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "OAuth check failed";
    return NextResponse.json({
      configured: true,
      authenticated: false,
      baseUrl,
      maskedClientId: `${clientId.slice(0, 6)}...`,
      message,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clientId: string;
      clientSecret: string;
      persistToEnvLocal?: boolean;
    };

    if (!body.clientId?.trim() || !body.clientSecret?.trim()) {
      return NextResponse.json(
        { error: "Both PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required." },
        { status: 400 }
      );
    }

    setRuntimePayPalCredentials({
      clientId: body.clientId.trim(),
      clientSecret: body.clientSecret.trim(),
      baseUrl: "https://api-m.sandbox.paypal.com",
    });

    // Verify immediately against PayPal Sandbox OAuth2 endpoint
    const tokenInfo = await getPayPalAccessToken();

    if (body.persistToEnvLocal) {
      const envPath = path.join(process.cwd(), ".env.local");
      const envContent = [
        `PAYPAL_CLIENT_ID=${body.clientId.trim()}`,
        `PAYPAL_CLIENT_SECRET=${body.clientSecret.trim()}`,
        `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com`,
      ].join("\n");
      await fs.writeFile(envPath, `${envContent}\n`, "utf8");
    }

    return NextResponse.json({
      configured: true,
      authenticated: true,
      appId: tokenInfo.appId,
      baseUrl: tokenInfo.baseUrl,
      maskedClientId: `${body.clientId.trim().slice(0, 8)}...${body.clientId
        .trim()
        .slice(-4)}`,
      message: "Verified PayPal Sandbox OAuth2 token exchange!",
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to verify PayPal credentials";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
