import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { loadPlaidConfig } from "@/lib/credentials/load";
import type { AuthContext } from "@/lib/auth";
import { suggestCategory } from "./categorize";
import { dayStart } from "./filters";
import { canConnectBank } from "./access";
import {
  openAccessToken,
  plaidAccountKind,
  plaidAmountToStored,
  safeBankMessage,
  sealAccessToken,
  type PlaidConfig,
} from "./plaid";

const SYNC_PAGE_LIMIT = 5;

type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  balances?: { current?: number | null; available?: number | null; iso_currency_code?: string | null };
};

type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name?: string | null;
  merchant_name?: string | null;
  pending?: boolean;
};

function assertConnect(ctx: AuthContext) {
  if (!canConnectBank(ctx)) throw new Error("Missing permission: manage_bank");
}

async function plaidPost<T>(config: PlaidConfig, path: string, body: Record<string, unknown>): Promise<T> {
  if (!config.ready || !config.clientId || !config.secret) {
    throw new Error("Invalid Plaid: credentials are not configured");
  }
  const response = await fetch(`${config.host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, secret: config.secret, ...body }),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error_message?: string; error_code?: string };
  if (!response.ok) {
    throw new Error(`Invalid Plaid: ${safeBankMessage(json.error_message || json.error_code || "request failed")}`);
  }
  return json;
}

function money(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}

async function loadCategorization(businessId: string) {
  const [rules, categories] = await Promise.all([
    db.expenseCategoryRule.findMany({
      where: { businessId },
      include: { category: { select: { name: true } } },
    }),
    db.expenseCategory.findMany({
      where: { businessId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  return {
    rules: rules.map((rule) => ({ pattern: rule.pattern, categoryId: rule.categoryId, categoryName: rule.category.name })),
    categoriesByName: Object.fromEntries(categories.map((category) => [category.name, category.id])),
  };
}

async function upsertPlaidAccounts(businessId: string, connectionId: string, accounts: PlaidAccount[]) {
  const ids = new Map<string, string>();
  for (const account of accounts) {
    const saved = await db.bankAccount.upsert({
      where: { businessId_externalId: { businessId, externalId: account.account_id } },
      create: {
        businessId,
        connectionId,
        externalId: account.account_id,
        name: account.name || "Bank account",
        officialName: account.official_name || null,
        mask: account.mask || null,
        kind: plaidAccountKind(account.type, account.subtype),
        currency: account.balances?.iso_currency_code || "USD",
        currentBalance: money(account.balances?.current),
        availableBalance: money(account.balances?.available),
        lastSyncedAt: new Date(),
      },
      update: {
        connectionId,
        name: account.name || "Bank account",
        officialName: account.official_name || null,
        mask: account.mask || null,
        kind: plaidAccountKind(account.type, account.subtype),
        currency: account.balances?.iso_currency_code || "USD",
        currentBalance: money(account.balances?.current),
        availableBalance: money(account.balances?.available),
        lastSyncedAt: new Date(),
      },
    });
    ids.set(account.account_id, saved.id);
  }
  return ids;
}

export async function bankConnectionStatus(businessId: string) {
  const config = await loadPlaidConfig();
  const connection = await db.bankConnection.findUnique({
    where: { businessId },
    include: {
      accounts: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          officialName: true,
          mask: true,
          kind: true,
          currentBalance: true,
          availableBalance: true,
          lastSyncedAt: true,
        },
      },
    },
  });
  return {
    credentialsReady: config.ready,
    missing: config.missing,
    environment: config.environment,
    status: connection?.status ?? "DISCONNECTED",
    institutionId: connection?.institutionId ?? null,
    institutionName: connection?.institutionName ?? null,
    itemId: connection?.itemId ?? null,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    lastSyncAt: connection?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: connection?.lastSyncStatus ?? null,
    lastSyncError: connection?.lastSyncError ?? null,
    accounts: (connection?.accounts ?? []).map((account) => ({
      id: account.id,
      name: account.name,
      officialName: account.officialName,
      mask: account.mask,
      kind: account.kind,
      currentBalance: account.currentBalance == null ? null : Number(account.currentBalance),
      availableBalance: account.availableBalance == null ? null : Number(account.availableBalance),
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    })),
  };
}

export async function createBankLinkToken(ctx: AuthContext) {
  assertConnect(ctx);
  const config = await loadPlaidConfig();
  if (!config.ready) throw new Error("Invalid Plaid: credentials are not configured");
  const connection = await db.bankConnection.findUnique({ where: { businessId: ctx.business.id } });
  const updateMode = Boolean(connection?.accessTokenCipher && connection.status !== "DISCONNECTED" && config.encryptionKey);
  const accessToken = updateMode && connection?.accessTokenCipher && config.encryptionKey
    ? openAccessToken(connection.accessTokenCipher, config.encryptionKey)
    : null;
  const body: Record<string, unknown> = {
    client_name: "EmeraldOne",
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: ctx.business.id },
  };
  if (accessToken) body.access_token = accessToken;
  else body.products = ["transactions"];
  const created = await plaidPost<{ link_token?: string }>(config, "/link/token/create", body);
  if (!created.link_token) throw new Error("Invalid Plaid: link token was not issued");
  return { linkToken: created.link_token, updateMode: Boolean(accessToken) };
}

export async function exchangeBankToken(
  ctx: AuthContext,
  input: { publicToken: string; institutionId?: string | null; institutionName?: string | null },
) {
  assertConnect(ctx);
  const config = await loadPlaidConfig();
  if (!config.ready || !config.encryptionKey) throw new Error("Invalid Plaid: credentials are not configured");
  if (!input.publicToken.trim()) throw new Error("Invalid Plaid: public token is required");
  const exchanged = await plaidPost<{ access_token?: string; item_id?: string }>(config, "/item/public_token/exchange", {
    public_token: input.publicToken.trim(),
  });
  if (!exchanged.access_token || !exchanged.item_id) throw new Error("Invalid Plaid: the bank did not return a token");
  const connection = await db.bankConnection.upsert({
    where: { businessId: ctx.business.id },
    create: {
      businessId: ctx.business.id,
      provider: "PLAID",
      status: "CONNECTED",
      institutionId: input.institutionId || null,
      institutionName: input.institutionName || null,
      itemId: exchanged.item_id,
      accessTokenCipher: sealAccessToken(exchanged.access_token, config.encryptionKey),
      environment: config.environment,
      connectedAt: new Date(),
      disconnectedAt: null,
    },
    update: {
      status: "CONNECTED",
      institutionId: input.institutionId || null,
      institutionName: input.institutionName || null,
      itemId: exchanged.item_id,
      accessTokenCipher: sealAccessToken(exchanged.access_token, config.encryptionKey),
      environment: config.environment,
      connectedAt: new Date(),
      disconnectedAt: null,
      lastSyncError: null,
    },
  });
  const accounts = await plaidPost<{ accounts?: PlaidAccount[] }>(config, "/accounts/get", {
    access_token: exchanged.access_token,
  });
  await upsertPlaidAccounts(ctx.business.id, connection.id, accounts.accounts ?? []);
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "SETTINGS_CHANGE",
    entity: "BankConnection",
    entityId: connection.id,
    details: {
      kind: "BANK_CONNECTED",
      provider: "PLAID",
      institutionId: input.institutionId || null,
      itemId: exchanged.item_id,
      accountCount: accounts.accounts?.length ?? 0,
    },
  });
  return bankConnectionStatus(ctx.business.id);
}

export async function syncBankConnection(ctx: AuthContext) {
  assertConnect(ctx);
  const config = await loadPlaidConfig();
  if (!config.ready || !config.encryptionKey) throw new Error("Invalid Plaid: credentials are not configured");
  const connection = await db.bankConnection.findUnique({ where: { businessId: ctx.business.id } });
  if (!connection || connection.status === "DISCONNECTED" || !connection.accessTokenCipher) {
    throw new Error("Invalid Plaid: the bank is not connected");
  }
  const accessToken = openAccessToken(connection.accessTokenCipher, config.encryptionKey);
  let cursor = connection.syncCursor;
  let added = 0;
  let modified = 0;
  let removed = 0;
  let partial = false;
  try {
    const accounts = await plaidPost<{ accounts?: PlaidAccount[] }>(config, "/accounts/get", { access_token: accessToken });
    const accountIds = await upsertPlaidAccounts(ctx.business.id, connection.id, accounts.accounts ?? []);
    const categorization = await loadCategorization(ctx.business.id);
    for (let page = 0; page < SYNC_PAGE_LIMIT; page += 1) {
      const payload: Record<string, unknown> = { access_token: accessToken };
      if (cursor) payload.cursor = cursor;
      const synced = await plaidPost<{
        added?: PlaidTransaction[];
        modified?: PlaidTransaction[];
        removed?: { transaction_id: string }[];
        next_cursor?: string;
        has_more?: boolean;
      }>(config, "/transactions/sync", payload);
      const counts = await applyPlaidTransactions(ctx.business.id, accountIds, categorization, synced.added ?? [], synced.modified ?? []);
      added += counts.added;
      modified += counts.modified;
      const removedIds = (synced.removed ?? []).map((row) => row.transaction_id).filter(Boolean);
      if (removedIds.length) {
        const result = await db.bankTransaction.deleteMany({
          where: { businessId: ctx.business.id, source: "PLAID", externalId: { in: removedIds } },
        });
        removed += result.count;
      }
      cursor = synced.next_cursor || cursor;
      await db.bankConnection.update({
        where: { id: connection.id },
        data: { syncCursor: cursor, lastSyncAt: new Date(), lastSyncStatus: synced.has_more ? "partial" : "ok", lastSyncError: null, status: "CONNECTED" },
      });
      if (!synced.has_more) {
        partial = false;
        break;
      }
      partial = page === SYNC_PAGE_LIMIT - 1;
    }
  } catch (error) {
    const message = safeBankMessage(error instanceof Error ? error.message : "sync failed");
    await db.bankConnection.update({
      where: { id: connection.id },
      data: { status: "ERROR", lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message },
    });
    throw new Error(message.startsWith("Invalid Plaid:") ? message : `Invalid Plaid: ${message}`);
  }
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "SETTINGS_CHANGE",
    entity: "BankConnection",
    entityId: connection.id,
    details: { kind: "BANK_SYNC", added, modified, removed, partial },
  });
  return { ...(await bankConnectionStatus(ctx.business.id)), added, modified, removed, partial };
}

async function applyPlaidTransactions(
  businessId: string,
  accountIds: Map<string, string>,
  categorization: Awaited<ReturnType<typeof loadCategorization>>,
  added: PlaidTransaction[],
  modified: PlaidTransaction[],
) {
  const incoming = [...added, ...modified].filter((txn) => !txn.pending);
  const existing = await db.bankTransaction.findMany({
    where: { businessId, source: "PLAID", externalId: { in: incoming.map((txn) => txn.transaction_id) } },
    select: { id: true, externalId: true, categoryId: true },
  });
  const byExternal = new Map(existing.map((row) => [row.externalId, row]));
  let addedCount = 0;
  let modifiedCount = 0;
  for (const txn of incoming) {
    const accountId = accountIds.get(txn.account_id);
    if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(txn.date)) continue;
    const suggestion = suggestCategory({
      merchant: txn.merchant_name || null,
      description: txn.name || "",
      rules: categorization.rules,
      categoriesByName: categorization.categoriesByName,
    });
    const current = byExternal.get(txn.transaction_id);
    const raw = {
      accountId,
      postedOn: dayStart(txn.date),
      rawDescription: (txn.name || "Bank transaction").slice(0, 500),
      rawMerchant: txn.merchant_name ? txn.merchant_name.slice(0, 200) : null,
      amount: plaidAmountToStored(txn.amount),
    };
    if (!current) {
      await db.bankTransaction.create({
        data: {
          businessId,
          source: "PLAID",
          externalId: txn.transaction_id,
          ...raw,
          categoryId: suggestion.applied ? suggestion.categoryId : null,
          suggestedCategoryId: suggestion.categoryId,
          suggestionReason: suggestion.reason,
          reconciliation: suggestion.applied && suggestion.categoryId ? "CATEGORIZED" : "UNREVIEWED",
        },
      });
      addedCount += 1;
      continue;
    }
    await db.bankTransaction.update({
      where: { id: current.id },
      data: {
        ...raw,
        ...(current.categoryId || !suggestion.applied
          ? { suggestedCategoryId: current.categoryId ? undefined : suggestion.categoryId, suggestionReason: current.categoryId ? undefined : suggestion.reason }
          : {
              categoryId: suggestion.categoryId,
              suggestedCategoryId: suggestion.categoryId,
              suggestionReason: suggestion.reason,
              reconciliation: "CATEGORIZED",
            }),
      },
    });
    modifiedCount += 1;
  }
  return { added: addedCount, modified: modifiedCount };
}

export async function disconnectBank(ctx: AuthContext) {
  assertConnect(ctx);
  const config = await loadPlaidConfig();
  const connection = await db.bankConnection.findUnique({ where: { businessId: ctx.business.id } });
  if (!connection) return { status: "DISCONNECTED" as const };
  if (connection.accessTokenCipher && config.ready && config.encryptionKey) {
    try {
      await plaidPost(config, "/item/remove", { access_token: openAccessToken(connection.accessTokenCipher, config.encryptionKey) });
    } catch {
      // Local disconnect still removes the token when Plaid cannot be reached.
    }
  }
  await db.bankConnection.update({
    where: { id: connection.id },
    data: {
      status: "DISCONNECTED",
      accessTokenCipher: null,
      syncCursor: null,
      disconnectedAt: new Date(),
    },
  });
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "SETTINGS_CHANGE",
    entity: "BankConnection",
    entityId: connection.id,
    details: { kind: "BANK_DISCONNECTED", provider: "PLAID", itemId: connection.itemId },
  });
  return { status: "DISCONNECTED" as const };
}
