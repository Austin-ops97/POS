import { redactString } from "@/lib/audit-redaction";
import { isClerkPublishableKey, isClerkSecretKey } from "@/lib/clerk-config";
import { intuitConfig } from "@/lib/integrations/quickbooks";
import { plaidConfig } from "@/lib/banking/plaid";
import { linkedInConfig, metaConfig } from "@/lib/social/providers";

export type ConnectionTone = "ok" | "warn" | "bad" | "neutral";

export type PublicConnection = {
  id: string;
  label: string;
  scope: "platform" | "business";
  status: string;
  tone: ConnectionTone;
  detail: string;
  href?: string;
  hrefLabel?: string;
};

function present(env: { [key: string]: string | undefined }, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function toneFor(status: string): ConnectionTone {
  if (status === "configured" || status === "connected") return "ok";
  if (status === "needs_credentials" || status === "pending" || status === "restricted") return "warn";
  if (status === "error") return "bad";
  return "neutral";
}

function credentialStatus(ready: boolean): "configured" | "needs_credentials" {
  return ready ? "configured" : "needs_credentials";
}

export function platformIntegrationStatus(env: { [key: string]: string | undefined } = process.env): PublicConnection[] {
  const source = env as NodeJS.ProcessEnv;
  const intuit = intuitConfig(source);
  const plaid = plaidConfig(source);
  const meta = metaConfig(source);
  const linkedin = linkedInConfig(source);
  const clerkOn =
    isClerkPublishableKey(source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    isClerkSecretKey(source.CLERK_SECRET_KEY);
  const stripeOn = present(source, "STRIPE_SECRET_KEY") && present(source, "STRIPE_WEBHOOK_SECRET");
  const livekitOn =
    present(source, "LIVEKIT_API_KEY") && present(source, "LIVEKIT_API_SECRET") && present(source, "LIVEKIT_URL");

  const rows: Array<Omit<PublicConnection, "tone"> & { status: string }> = [
    {
      id: "clerk",
      label: "Clerk",
      scope: "platform",
      status: clerkOn ? "configured" : "not_configured",
      detail: "Status only. Clerk keys stay in the environment and are not edited here.",
    },
    {
      id: "stripe",
      label: "Stripe",
      scope: "platform",
      status: stripeOn ? "configured" : "needs_credentials",
      detail: [
        `Secret key ${present(source, "STRIPE_SECRET_KEY") ? "set" : "missing"}`,
        `Publishable key ${present(source, "STRIPE_PUBLISHABLE_KEY") || present(source, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") ? "set" : "missing"}`,
        `Webhook secret ${present(source, "STRIPE_WEBHOOK_SECRET") ? "set" : "missing"}`,
        `Connect client ${present(source, "STRIPE_CONNECT_CLIENT_ID") ? "set" : "missing"}`,
      ].join(" · "),
    },
    {
      id: "intuit",
      label: "Intuit QuickBooks",
      scope: "platform",
      status: credentialStatus(intuit.ready),
      detail: intuit.ready
        ? `App credentials set (${intuit.environment}).`
        : `Missing ${intuit.missing.join(", ") || "credentials"}.`,
    },
    {
      id: "plaid",
      label: "Plaid",
      scope: "platform",
      status: credentialStatus(plaid.ready),
      detail: plaid.ready
        ? `App credentials set (${plaid.environment}).`
        : `Missing ${plaid.missing.join(", ") || "credentials"}.`,
    },
    {
      id: "meta",
      label: "Meta",
      scope: "platform",
      status: credentialStatus(meta.ready),
      detail: meta.ready ? "App credentials set." : `Missing ${meta.missing.join(", ") || "credentials"}.`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      scope: "platform",
      status: credentialStatus(linkedin.ready),
      detail: linkedin.ready
        ? "App credentials set."
        : `Missing ${linkedin.missing.join(", ") || "credentials"}.`,
    },
    {
      id: "encryption",
      label: "Token encryption keys",
      scope: "platform",
      status:
        present(source, "INTUIT_TOKEN_ENCRYPTION_KEY") &&
        present(source, "PLAID_TOKEN_ENCRYPTION_KEY") &&
        present(source, "SOCIAL_TOKEN_ENCRYPTION_KEY")
          ? "configured"
          : "needs_credentials",
      detail: [
        `INTUIT_TOKEN_ENCRYPTION_KEY ${present(source, "INTUIT_TOKEN_ENCRYPTION_KEY") ? "set" : "missing"}`,
        `PLAID_TOKEN_ENCRYPTION_KEY ${present(source, "PLAID_TOKEN_ENCRYPTION_KEY") ? "set" : "missing"}`,
        `SOCIAL_TOKEN_ENCRYPTION_KEY ${present(source, "SOCIAL_TOKEN_ENCRYPTION_KEY") ? "set" : "missing"}`,
        "A missing key is generated in the vault the first time that provider is saved",
      ].join(" · "),
    },
    {
      id: "resend",
      label: "Resend",
      scope: "platform",
      status: present(source, "RESEND_API_KEY") ? "configured" : "not_configured",
      detail: "Receipts, reminders, and office email.",
    },
    {
      id: "livekit",
      label: "LiveKit",
      scope: "platform",
      status: livekitOn ? "configured" : "not_configured",
      detail: "Connections audio and video.",
    },
    {
      id: "blob",
      label: "Blob storage",
      scope: "platform",
      status: present(source, "BLOB_READ_WRITE_TOKEN") ? "configured" : "not_configured",
      detail: "Project photos and Instagram image hosting.",
    },
    {
      id: "upstash",
      label: "Upstash Redis",
      scope: "platform",
      status:
        present(source, "UPSTASH_REDIS_REST_URL") && present(source, "UPSTASH_REDIS_REST_TOKEN")
          ? "configured"
          : "not_configured",
      detail: "Optional shared rate limit store.",
    },
    {
      id: "sentry",
      label: "Sentry",
      scope: "platform",
      status: present(source, "SENTRY_DSN") ? "configured" : "not_configured",
      detail: "Optional error monitoring.",
    },
  ];

  return rows.map((row) => ({ ...row, tone: toneFor(row.status) }));
}

type BusinessConnectionInput = {
  stripe?: {
    status?: string | null;
    chargesEnabled?: boolean | null;
    payoutsEnabled?: boolean | null;
  } | null;
  quickbooks?: {
    status?: string | null;
    companyName?: string | null;
    lastSyncError?: string | null;
    environment?: string | null;
  } | null;
  bank?: {
    status?: string | null;
    institutionName?: string | null;
    lastSyncError?: string | null;
  } | null;
  social?: Array<{
    platform?: string | null;
    status?: string | null;
    displayName?: string | null;
    lastSyncError?: string | null;
  }>;
};

function safeText(value: string | null | undefined): string {
  if (!value) return "";
  return redactString(value);
}

function businessTone(status: string): ConnectionTone {
  if (status === "CONNECTED" || status === "READY") return "ok";
  if (status === "PENDING" || status === "RESTRICTED") return "warn";
  if (status === "ERROR") return "bad";
  return "neutral";
}

export function publicBusinessConnections(input: BusinessConnectionInput): PublicConnection[] {
  const stripeStatus = input.stripe?.status || "NOT_CONNECTED";
  const qbStatus = input.quickbooks?.status || "DISCONNECTED";
  const bankStatus = input.bank?.status || "DISCONNECTED";
  const social = input.social ?? [];
  const socialConnected = social.filter((row) => row.status === "CONNECTED");
  const socialError = social.find((row) => row.status === "ERROR");

  const stripeDetail = [
    stripeStatus === "NOT_CONNECTED" ? "Not connected" : stripeStatus,
    input.stripe?.chargesEnabled ? "charges on" : "charges off",
    input.stripe?.payoutsEnabled ? "payouts on" : "payouts off",
  ].join(" · ");

  const qbError = safeText(input.quickbooks?.lastSyncError);
  const bankError = safeText(input.bank?.lastSyncError);

  return [
    {
      id: "stripe-business",
      label: "Stripe Connect",
      scope: "business",
      status: stripeStatus === "READY" || stripeStatus === "CONNECTED" ? "connected" : stripeStatus === "NOT_CONNECTED" ? "not_connected" : stripeStatus.toLowerCase(),
      tone: businessTone(stripeStatus),
      detail: stripeDetail,
      href: "/settings/payments",
      hrefLabel: "Open payments",
    },
    {
      id: "quickbooks-business",
      label: "QuickBooks",
      scope: "business",
      status: qbStatus === "CONNECTED" ? "connected" : qbStatus === "ERROR" ? "error" : "not_connected",
      tone: businessTone(qbStatus),
      detail: [
        input.quickbooks?.companyName || "No company linked",
        input.quickbooks?.environment || null,
        qbError || null,
      ].filter(Boolean).join(" · "),
      href: "/settings/integrations/quickbooks",
      hrefLabel: "Reconnect in the workspace",
    },
    {
      id: "plaid-business",
      label: "Bank (Plaid)",
      scope: "business",
      status: bankStatus === "CONNECTED" ? "connected" : bankStatus === "ERROR" ? "error" : "not_connected",
      tone: businessTone(bankStatus),
      detail: [input.bank?.institutionName || "No bank linked", bankError || null].filter(Boolean).join(" · "),
      href: "/settings/integrations/banking",
      hrefLabel: "Open banking",
    },
    {
      id: "social-business",
      label: "Social accounts",
      scope: "business",
      status: socialError ? "error" : socialConnected.length > 0 ? "connected" : "not_connected",
      tone: socialError ? "bad" : socialConnected.length > 0 ? "ok" : "neutral",
      detail:
        social.length === 0
          ? "No Facebook, Instagram, or LinkedIn account linked."
          : social
              .map((row) => {
                const name = row.displayName || row.platform || "Account";
                const err = safeText(row.lastSyncError);
                return `${name}: ${row.status || "DISCONNECTED"}${err ? ` (${err})` : ""}`;
              })
              .join(" · "),
      href: "/settings/integrations/social",
      hrefLabel: "Open social",
    },
  ];
}
