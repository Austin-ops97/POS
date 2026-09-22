import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { safeBuilderAuditDetails } from "@/lib/builder/audit";
import {
  credentialHint,
  isPlatformProviderId,
  masterKeyBytes,
  masterKeyState,
  mergeCredentialEnv,
  openVaultValue,
  planProviderWrite,
  projectPlatformCredentials,
  providerClearKeys,
  readPlatformCredential,
  sealVaultValue,
  type PlatformProviderId,
} from "./catalog";

const CACHE_MS = 5_000;

type VaultSnapshot = {
  values: Record<string, string>;
  updatedAt: Record<string, string>;
};

type CredentialDeps = {
  vault?: Record<string, string | undefined>;
  env?: NodeJS.ProcessEnv;
};

let cache: { expires: number; snapshot: VaultSnapshot } | null = null;

export function invalidatePlatformCredentialCache() {
  cache = null;
}

async function loadVaultSnapshot(): Promise<VaultSnapshot> {
  if (cache && cache.expires > Date.now()) return cache.snapshot;
  const key = masterKeyBytes();
  if (!key) return { values: {}, updatedAt: {} };
  let rows: { key: string; ciphertext: string; updatedAt: Date }[] = [];
  try {
    rows = await db.platformCredential.findMany({
      select: { key: true, ciphertext: true, updatedAt: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
      console.error("Platform credential vault is not migrated; using host environment only");
      return { values: {}, updatedAt: {} };
    }
    throw error;
  }
  const values: Record<string, string> = {};
  const updatedAt: Record<string, string> = {};
  for (const row of rows) {
    try {
      values[row.key] = openVaultValue(row.ciphertext, key);
      updatedAt[row.key] = row.updatedAt.toISOString();
    } catch {
      console.error(`Platform credential ${row.key} could not be decrypted`);
    }
  }
  const snapshot = { values, updatedAt };
  cache = { expires: Date.now() + CACHE_MS, snapshot };
  return snapshot;
}

/**
 * Platform integration secret. The vault wins when it has a value; otherwise
 * the host environment is used so existing deployments keep working.
 */
export async function getPlatformCredential(name: string, deps: CredentialDeps = {}): Promise<string | null> {
  const vault = deps.vault ?? (await loadVaultSnapshot()).values;
  const env = deps.env ?? process.env;
  return readPlatformCredential(name, vault, env);
}

export async function platformCredentialEnv(deps: CredentialDeps = {}): Promise<NodeJS.ProcessEnv> {
  const vault = deps.vault ?? (await loadVaultSnapshot()).values;
  const env = deps.env ?? process.env;
  return mergeCredentialEnv(env, vault);
}

async function recentCredentialAudit() {
  const events = await db.builderAuditEvent.findMany({
    where: { action: { in: ["PLATFORM_CREDENTIALS_SET", "PLATFORM_CREDENTIALS_CLEAR"] } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, action: true, actorEmail: true, createdAt: true, details: true },
  });
  return events.map((event) => ({
    id: event.id,
    action: event.action,
    actorEmail: event.actorEmail,
    createdAt: event.createdAt.toISOString(),
    details: event.details,
  }));
}

export async function platformCredentialCatalog() {
  const snapshot = await loadVaultSnapshot();
  const projected = projectPlatformCredentials({
    vault: snapshot.values,
    env: process.env,
    updatedAt: snapshot.updatedAt,
  });
  return { ...projected, audit: await recentCredentialAudit() };
}

function requireMasterKey(): Buffer {
  const key = masterKeyBytes();
  if (key) return key;
  const state = masterKeyState();
  throw new Error(
    state === "invalid"
      ? "CREDENTIALS_ENCRYPTION_KEY is not configured. It must be 32 bytes, base64-encoded."
      : "CREDENTIALS_ENCRYPTION_KEY is not configured"
  );
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    action: "PLATFORM_CREDENTIALS_SET" | "PLATFORM_CREDENTIALS_CLEAR";
    provider: PlatformProviderId;
    fields: string[];
    actorUserId?: string | null;
    actorEmail?: string | null;
    ipAddress?: string;
  }
) {
  await tx.builderAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: input.action,
      details: safeBuilderAuditDetails({ provider: input.provider, fields: input.fields }),
      ipAddress: input.ipAddress,
    },
  });
}

export async function savePlatformProvider(input: {
  provider: string;
  values: Record<string, string | undefined>;
  actorUserId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string;
}) {
  if (!isPlatformProviderId(input.provider)) {
    throw new Error("Invalid platform credentials: unknown provider");
  }
  const provider = input.provider;
  const key = requireMasterKey();
  const snapshot = await loadVaultSnapshot();
  const plan = planProviderWrite({
    provider,
    incoming: input.values,
    vault: snapshot.values,
    env: process.env,
  });
  if (!plan.ok) throw new Error(plan.error);
  const fields = Object.keys(plan.upserts);
  if (fields.length > 0) {
    await db.$transaction(async (tx) => {
      for (const field of fields) {
        const value = plan.upserts[field];
        const ciphertext = sealVaultValue(value, key);
        await tx.platformCredential.upsert({
          where: { key: field },
          create: {
            key: field,
            ciphertext,
            hint: credentialHint(value),
            updatedById: input.actorUserId ?? null,
            updatedByEmail: input.actorEmail ?? null,
          },
          update: {
            ciphertext,
            hint: credentialHint(value),
            updatedById: input.actorUserId ?? null,
            updatedByEmail: input.actorEmail ?? null,
          },
        });
      }
      await writeAudit(tx, {
        action: "PLATFORM_CREDENTIALS_SET",
        provider,
        fields,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        ipAddress: input.ipAddress,
      });
    });
    invalidatePlatformCredentialCache();
  }
  return platformCredentialCatalog();
}

export async function clearPlatformProvider(input: {
  provider: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string;
}) {
  if (!isPlatformProviderId(input.provider)) {
    throw new Error("Invalid platform credentials: unknown provider");
  }
  const provider = input.provider;
  const fields = providerClearKeys(provider);
  await db.$transaction(async (tx) => {
    await tx.platformCredential.deleteMany({ where: { key: { in: fields } } });
    await writeAudit(tx, {
      action: "PLATFORM_CREDENTIALS_CLEAR",
      provider,
      fields,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      ipAddress: input.ipAddress,
    });
  });
  invalidatePlatformCredentialCache();
  return platformCredentialCatalog();
}
