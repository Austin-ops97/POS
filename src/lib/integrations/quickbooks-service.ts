import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { loadIntuitConfig } from "@/lib/credentials/load";
import { commitImportBatch, createImportBatch, previewImportBatch } from "@/lib/import/import-service";
import { isCommitEntity, suggestMapping, tableFromRows } from "@/lib/import/import-plan";
import {
  decryptSecret,
  encryptSecret,
  intuitApiBase,
  intuitAuthorizeUrl,
  quickBooksRows,
  signOAuthState,
  verifyOAuthState,
  type QuickBooksRecord,
} from "./quickbooks";

const ENTITY_FOR_INTUIT: Record<string, "CUSTOMER" | "VENDOR" | "PRODUCT" | "EXPENSE"> = {
  Customer: "CUSTOMER",
  Vendor: "VENDOR",
  Item: "PRODUCT",
  Purchase: "EXPENSE",
};

function safeMessage(value: string): string {
  return value.replace(/access_token[\s:=]+[^\s,]+/gi, "access_token=[redacted]").replace(/refresh_token[\s:=]+[^\s,]+/gi, "refresh_token=[redacted]").slice(0, 300);
}

export async function quickBooksStatus(businessId: string) {
  const config = await loadIntuitConfig();
  const connection = await db.quickBooksConnection.findUnique({ where: { businessId } });
  const logs = connection
    ? await db.quickBooksSyncLog.findMany({
        where: { businessId, connectionId: connection.id },
        orderBy: { startedAt: "desc" },
        take: 15,
        select: {
          id: true,
          direction: true,
          entityType: true,
          status: true,
          message: true,
          importedCount: true,
          updatedCount: true,
          skippedCount: true,
          failedCount: true,
          startedAt: true,
          finishedAt: true,
        },
      })
    : [];
  return {
    credentialsReady: config.ready,
    missing: config.missing,
    environment: config.environment,
    status: connection?.status ?? "DISCONNECTED",
    companyName: connection?.companyName ?? null,
    realmId: connection?.realmId ?? null,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: connection?.lastSyncStatus ?? null,
    lastSyncError: connection?.lastSyncError ?? null,
    logs: logs.map((log) => ({ ...log, startedAt: log.startedAt.toISOString(), finishedAt: log.finishedAt?.toISOString() ?? null })),
  };
}

export async function quickBooksConnectUrl(input: { businessId: string; employeeId: string }) {
  const config = await loadIntuitConfig();
  if (!config.ready || !config.clientSecret) throw new Error("Invalid QuickBooks: Intuit credentials are not configured");
  const state = signOAuthState(input, config.clientSecret);
  return intuitAuthorizeUrl(config, state);
}

export async function connectQuickBooks(input: {
  businessId: string;
  employeeId: string;
  code: string;
  realmId: string;
  state: string;
}) {
  const config = await loadIntuitConfig();
  if (!config.ready || !config.clientId || !config.clientSecret || !config.redirectUri || !config.encryptionKey) {
    throw new Error("Invalid QuickBooks: Intuit credentials are not configured");
  }
  const statePayload = verifyOAuthState(input.state, config.clientSecret);
  if (!statePayload || statePayload.businessId !== input.businessId || statePayload.employeeId !== input.employeeId) {
    throw new Error("Invalid QuickBooks: the connection request expired");
  }
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const tokenResponse = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: config.redirectUri,
    }),
  });
  const tokenJson = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!tokenResponse.ok || !tokenJson.access_token || !tokenJson.refresh_token) {
    throw new Error(`Invalid QuickBooks: authorization failed${tokenJson.error ? ` (${tokenJson.error})` : ""}`);
  }
  const companyName = await readCompanyName(config.environment, input.realmId, tokenJson.access_token);
  await db.quickBooksConnection.upsert({
    where: { businessId: input.businessId },
    create: {
      businessId: input.businessId,
      realmId: input.realmId,
      companyName,
      status: "CONNECTED",
      environment: config.environment,
      accessTokenCipher: encryptSecret(tokenJson.access_token, config.encryptionKey),
      refreshTokenCipher: encryptSecret(tokenJson.refresh_token, config.encryptionKey),
      accessTokenExpiresAt: new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000),
      connectedAt: new Date(),
      disconnectedAt: null,
    },
    update: {
      realmId: input.realmId,
      companyName,
      status: "CONNECTED",
      environment: config.environment,
      accessTokenCipher: encryptSecret(tokenJson.access_token, config.encryptionKey),
      refreshTokenCipher: encryptSecret(tokenJson.refresh_token, config.encryptionKey),
      accessTokenExpiresAt: new Date(Date.now() + (tokenJson.expires_in ?? 3600) * 1000),
      connectedAt: new Date(),
      disconnectedAt: null,
      lastSyncError: null,
    },
  });
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "SETTINGS_CHANGE",
    entity: "QuickBooksConnection",
    details: { kind: "QUICKBOOKS_CONNECTED", realmId: input.realmId, companyName },
  });
}

async function readCompanyName(environment: "sandbox" | "production", realmId: string, accessToken: string): Promise<string | null> {
  const response = await fetch(`${intuitApiBase(environment)}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=73`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { CompanyInfo?: { CompanyName?: string } } | null;
  return body?.CompanyInfo?.CompanyName ?? null;
}

export async function disconnectQuickBooks(input: { businessId: string; employeeId: string }) {
  const connection = await db.quickBooksConnection.findUnique({ where: { businessId: input.businessId } });
  if (!connection) return { status: "DISCONNECTED" as const };
  await db.quickBooksConnection.update({
    where: { id: connection.id },
    data: {
      status: "DISCONNECTED",
      accessTokenCipher: null,
      refreshTokenCipher: null,
      accessTokenExpiresAt: null,
      disconnectedAt: new Date(),
    },
  });
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "SETTINGS_CHANGE",
    entity: "QuickBooksConnection",
    entityId: connection.id,
    details: { kind: "QUICKBOOKS_DISCONNECTED", realmId: connection.realmId },
  });
  return { status: "DISCONNECTED" as const };
}

async function accessTokenFor(businessId: string): Promise<{ token: string; realmId: string; environment: "sandbox" | "production"; connectionId: string }> {
  const config = await loadIntuitConfig();
  if (!config.ready || !config.clientId || !config.clientSecret || !config.encryptionKey) {
    throw new Error("Invalid QuickBooks: Intuit credentials are not configured");
  }
  const connection = await db.quickBooksConnection.findUnique({ where: { businessId } });
  if (!connection || connection.status !== "CONNECTED" || !connection.realmId || !connection.refreshTokenCipher || !connection.accessTokenCipher) {
    throw new Error("Invalid QuickBooks: QuickBooks is not connected");
  }
  const environment = connection.environment === "production" ? "production" : "sandbox";
  if (connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
    return { token: decryptSecret(connection.accessTokenCipher, config.encryptionKey), realmId: connection.realmId, environment, connectionId: connection.id };
  }
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const refreshToken = decryptSecret(connection.refreshTokenCipher, config.encryptionKey);
  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const json = (await response.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!response.ok || !json.access_token) {
    await db.quickBooksConnection.update({
      where: { id: connection.id },
      data: { status: "ERROR", lastSyncError: "QuickBooks rejected the refresh token" },
    });
    throw new Error("Invalid QuickBooks: reconnect QuickBooks to continue");
  }
  await db.quickBooksConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenCipher: encryptSecret(json.access_token, config.encryptionKey),
      refreshTokenCipher: encryptSecret(json.refresh_token ?? refreshToken, config.encryptionKey),
      accessTokenExpiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
      status: "CONNECTED",
    },
  });
  return { token: json.access_token, realmId: connection.realmId, environment, connectionId: connection.id };
}

export async function pullQuickBooksEntity(input: { businessId: string; employeeId: string; entity: string }) {
  const mapped = ENTITY_FOR_INTUIT[input.entity];
  if (!mapped || !isCommitEntity(mapped)) throw new Error("Invalid QuickBooks: that record type cannot be pulled");
  const session = await accessTokenFor(input.businessId);
  const log = await db.quickBooksSyncLog.create({
    data: {
      businessId: input.businessId,
      connectionId: session.connectionId,
      direction: "PULL",
      entityType: input.entity,
      status: "STARTED",
    },
  });
  try {
    const query = `select * from ${input.entity} startposition 1 maxresults 200`;
    const response = await fetch(`${intuitApiBase(session.environment)}/v3/company/${session.realmId}/query?query=${encodeURIComponent(query)}&minorversion=73`, {
      headers: { Authorization: `Bearer ${session.token}`, Accept: "application/json" },
    });
    const body = (await response.json().catch(() => ({}))) as { QueryResponse?: Record<string, QuickBooksRecord[]>; Fault?: { Error?: Array<{ Message?: string }> } };
    if (!response.ok) {
      const message = safeMessage(body.Fault?.Error?.[0]?.Message ?? "QuickBooks query failed");
      throw new Error(`Invalid QuickBooks: ${message}`);
    }
    const records = body.QueryResponse?.[input.entity] ?? [];
    if (!records.length) {
      await db.quickBooksSyncLog.update({ where: { id: log.id }, data: { status: "SUCCESS", message: "No records returned", finishedAt: new Date() } });
      await db.quickBooksConnection.update({ where: { id: session.connectionId }, data: { lastSyncAt: new Date(), lastSyncStatus: "SUCCESS", lastSyncError: null } });
      return { imported: 0, updated: 0, skipped: 0, failed: 0, batchId: null };
    }
    const table = quickBooksRows(input.entity, records);
    const parsed = tableFromRows("CSV", [table.headers, ...table.rows]);
    const created = await createImportBatch({
      businessId: input.businessId,
      employeeId: input.employeeId,
      fileName: `QuickBooks ${input.entity}`,
      table: parsed,
      source: "QUICKBOOKS",
    });
    const mapping = suggestMapping(mapped, table.headers);
    await previewImportBatch({ businessId: input.businessId, batchId: created.id, entityType: mapped, mapping });
    const result = await commitImportBatch({ businessId: input.businessId, employeeId: input.employeeId, batchId: created.id });
    await db.quickBooksSyncLog.update({
      where: { id: log.id },
      data: {
        status: "SUCCESS",
        importedCount: result.imported,
        updatedCount: result.updated,
        skippedCount: result.skipped,
        failedCount: result.failed,
        finishedAt: new Date(),
        message: `Batch ${result.id}`,
      },
    });
    await db.quickBooksConnection.update({
      where: { id: session.connectionId },
      data: { lastSyncAt: new Date(), lastSyncStatus: "SUCCESS", lastSyncError: null },
    });
    return { ...result, batchId: result.id };
  } catch (error) {
    const message = safeMessage(error instanceof Error ? error.message : "QuickBooks sync failed");
    await db.quickBooksSyncLog.update({ where: { id: log.id }, data: { status: "ERROR", message, finishedAt: new Date() } });
    await db.quickBooksConnection.update({ where: { id: session.connectionId }, data: { lastSyncAt: new Date(), lastSyncStatus: "ERROR", lastSyncError: message } });
    throw error;
  }
}
