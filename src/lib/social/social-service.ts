import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { loadLinkedInConfig, loadMetaConfig } from "@/lib/credentials/load";
import type { AuthContext } from "@/lib/auth";
import { canManageSocial, canPublishSocial, canViewSocial } from "./access";
import { PERMISSIONS } from "@/lib/permissions";
import {
  composedCaption,
  platformIssue,
  socialConnectionWhere,
  socialPostWhere,
  summarizeDeliveries,
  type SocialPlatformName,
} from "./plan";
import {
  META_GRAPH_VERSION,
  linkedInAuthorizeUrl,
  metaAuthorizeUrl,
  openSocialToken,
  readSocialOAuthState,
  safeSocialMessage,
  sealSocialToken,
  socialAuditDetails,
  socialConnectGate,
  socialOAuthState,
  type SocialProviderConfig,
  type SocialVaultProvider,
} from "./providers";

const IMAGE_LIMIT = 4_000_000;
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

type AuthError = Error & { auth?: boolean };

function assertManage(ctx: AuthContext) {
  if (!canManageSocial(ctx)) throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_SOCIAL}`);
}

function assertPublish(ctx: AuthContext) {
  if (!canPublishSocial(ctx)) throw new Error(`Missing permission: ${PERMISSIONS.PUBLISH_SOCIAL}`);
}

function assertSocialView(ctx: AuthContext) {
  if (!canViewSocial(ctx)) throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_SOCIAL}`);
}

function authError(message: string): AuthError {
  const error = new Error(safeSocialMessage(message)) as AuthError;
  error.auth = true;
  return error;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return json && typeof json === "object" ? json : {};
}

function graphMessage(json: Record<string, unknown>, fallback: string): { message: string; code?: number } {
  const error = json.error;
  if (!error || typeof error !== "object") return { message: fallback };
  const record = error as { message?: string; code?: number };
  return { message: record.message || fallback, code: record.code };
}

async function metaGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await readJson(response);
  if (!response.ok || json.error) {
    const parsed = graphMessage(json, "Meta request failed");
    throw parsed.code === 190 || response.status === 401 ? authError(parsed.message) : new Error(safeSocialMessage(parsed.message));
  }
  return json as T;
}

async function metaPost<T>(path: string, token: string, body: FormData | Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}${path}`, {
    method: "POST",
    headers: body instanceof FormData ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const json = await readJson(response);
  if (!response.ok || json.error) {
    const parsed = graphMessage(json, "Meta request failed");
    throw parsed.code === 190 || response.status === 401 ? authError(parsed.message) : new Error(safeSocialMessage(parsed.message));
  }
  return json as T;
}

function requireKey(config: SocialProviderConfig, provider: SocialVaultProvider): Buffer {
  const gate = socialConnectGate(config, provider);
  if (!gate.allow || !config.encryptionKey) {
    throw new Error(gate.message ?? "Invalid social: credentials are not configured");
  }
  return config.encryptionKey;
}

export async function metaConnectUrl(ctx: AuthContext): Promise<string> {
  assertManage(ctx);
  const config = await loadMetaConfig();
  requireKey(config, "meta");
  const state = socialOAuthState({ businessId: ctx.business.id, employeeId: ctx.employee.id }, config.clientSecret as string);
  return metaAuthorizeUrl(config, state);
}

export async function linkedInConnectUrl(ctx: AuthContext): Promise<string> {
  assertManage(ctx);
  const config = await loadLinkedInConfig();
  requireKey(config, "linkedin");
  const state = socialOAuthState({ businessId: ctx.business.id, employeeId: ctx.employee.id }, config.clientSecret as string);
  return linkedInAuthorizeUrl(config, state);
}

async function exchangeMetaUserToken(config: SocialProviderConfig, code: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", config.clientId as string);
  url.searchParams.set("client_secret", config.clientSecret as string);
  url.searchParams.set("redirect_uri", config.redirectUri as string);
  url.searchParams.set("code", code);
  const first = await readJson(await fetch(url));
  const shortToken = typeof first.access_token === "string" ? first.access_token : "";
  if (!shortToken) throw new Error("Invalid social: Meta authorization failed");
  const long = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  long.searchParams.set("grant_type", "fb_exchange_token");
  long.searchParams.set("client_id", config.clientId as string);
  long.searchParams.set("client_secret", config.clientSecret as string);
  long.searchParams.set("fb_exchange_token", shortToken);
  const second = await readJson(await fetch(long));
  return typeof second.access_token === "string" ? second.access_token : shortToken;
}

export async function connectMeta(ctx: AuthContext, input: { code: string; state: string }) {
  assertManage(ctx);
  const config = await loadMetaConfig();
  const key = requireKey(config, "meta");
  const state = readSocialOAuthState(input.state, config.clientSecret as string);
  if (!state || state.businessId !== ctx.business.id || state.employeeId !== ctx.employee.id) {
    throw new Error("Invalid social: the connection request expired");
  }
  const userToken = await exchangeMetaUserToken(config, input.code);
  const pages = await metaGet<{
    data?: { id: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string } | null }[];
  }>("/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}", userToken);
  const connected: { platform: SocialPlatformName; externalId: string }[] = [];
  for (const page of pages.data ?? []) {
    if (!page.id || !page.access_token) continue;
    await db.socialConnection.upsert({
      where: { businessId_platform_externalId: { businessId: ctx.business.id, platform: "FACEBOOK", externalId: page.id } },
      create: {
        businessId: ctx.business.id,
        platform: "FACEBOOK",
        status: "CONNECTED",
        externalId: page.id,
        displayName: page.name || "Facebook Page",
        accountKind: "PAGE",
        accessTokenCipher: sealSocialToken(page.access_token, key),
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        lastSyncStatus: "ok",
      },
      update: {
        status: "CONNECTED",
        displayName: page.name || "Facebook Page",
        accountKind: "PAGE",
        accessTokenCipher: sealSocialToken(page.access_token, key),
        disconnectedAt: null,
        lastSyncError: null,
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        lastSyncStatus: "ok",
      },
    });
    connected.push({ platform: "FACEBOOK", externalId: page.id });
    const instagram = page.instagram_business_account;
    if (instagram?.id) {
      await db.socialConnection.upsert({
        where: { businessId_platform_externalId: { businessId: ctx.business.id, platform: "INSTAGRAM", externalId: instagram.id } },
        create: {
          businessId: ctx.business.id,
          platform: "INSTAGRAM",
          status: "CONNECTED",
          externalId: instagram.id,
          displayName: instagram.username ? `@${instagram.username}` : "Instagram",
          accountKind: "BUSINESS",
          parentExternalId: page.id,
          accessTokenCipher: sealSocialToken(page.access_token, key),
          connectedAt: new Date(),
          lastSyncAt: new Date(),
          lastSyncStatus: "ok",
        },
        update: {
          status: "CONNECTED",
          displayName: instagram.username ? `@${instagram.username}` : "Instagram",
          parentExternalId: page.id,
          accessTokenCipher: sealSocialToken(page.access_token, key),
          disconnectedAt: null,
          lastSyncError: null,
          connectedAt: new Date(),
          lastSyncAt: new Date(),
          lastSyncStatus: "ok",
        },
      });
      connected.push({ platform: "INSTAGRAM", externalId: instagram.id });
    }
  }
  if (connected.length === 0) throw new Error("Invalid social: no Facebook Pages were authorized");
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "SETTINGS_CHANGE",
    entity: "SocialConnection",
    details: socialAuditDetails({
      kind: "SOCIAL_CONNECTED",
      results: connected.map((row) => ({ platform: row.platform, status: "CONNECTED" })),
    }),
  });
  return { connected: connected.length };
}

async function linkedInToken(config: SocialProviderConfig, body: URLSearchParams): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await readJson(response);
  const access = typeof json.access_token === "string" ? json.access_token : "";
  if (!response.ok || !access) throw new Error("Invalid social: LinkedIn authorization failed");
  return {
    access_token: access,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : undefined,
  };
}

async function linkedInJson<T>(path: string, token: string, init?: { method?: string; body?: string }): Promise<T> {
  const response = await fetch(`https://api.linkedin.com${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202510",
      "X-Restli-Protocol-Version": "2.0.0",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body,
  });
  const json = await readJson(response);
  if (!response.ok) {
    const message = typeof json.message === "string" ? json.message : "LinkedIn request failed";
    throw response.status === 401 ? authError(message) : new Error(safeSocialMessage(message));
  }
  return json as T;
}

export async function connectLinkedIn(ctx: AuthContext, input: { code: string; state: string }) {
  assertManage(ctx);
  const config = await loadLinkedInConfig();
  const key = requireKey(config, "linkedin");
  const state = readSocialOAuthState(input.state, config.clientSecret as string);
  if (!state || state.businessId !== ctx.business.id || state.employeeId !== ctx.employee.id) {
    throw new Error("Invalid social: the connection request expired");
  }
  const token = await linkedInToken(
    config,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: config.redirectUri as string,
      client_id: config.clientId as string,
      client_secret: config.clientSecret as string,
    }),
  );
  const profile = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
  const profileJson = await readJson(profile);
  const sub = typeof profileJson.sub === "string" ? profileJson.sub : "";
  if (!profile.ok || !sub) throw new Error("Invalid social: LinkedIn did not return a profile");
  const name = typeof profileJson.name === "string" ? profileJson.name : "LinkedIn member";
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
  const connected: { platform: SocialPlatformName; externalId: string }[] = [];
  await db.socialConnection.upsert({
    where: { businessId_platform_externalId: { businessId: ctx.business.id, platform: "LINKEDIN", externalId: `urn:li:person:${sub}` } },
    create: {
      businessId: ctx.business.id,
      platform: "LINKEDIN",
      status: "CONNECTED",
      externalId: `urn:li:person:${sub}`,
      displayName: name,
      accountKind: "PROFILE",
      accessTokenCipher: sealSocialToken(token.access_token, key),
      refreshTokenCipher: token.refresh_token ? sealSocialToken(token.refresh_token, key) : null,
      tokenExpiresAt: expiresAt,
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      lastSyncStatus: "ok",
    },
    update: {
      status: "CONNECTED",
      displayName: name,
      accessTokenCipher: sealSocialToken(token.access_token, key),
      refreshTokenCipher: token.refresh_token ? sealSocialToken(token.refresh_token, key) : null,
      tokenExpiresAt: expiresAt,
      disconnectedAt: null,
      lastSyncError: null,
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      lastSyncStatus: "ok",
    },
  });
  connected.push({ platform: "LINKEDIN", externalId: `urn:li:person:${sub}` });
  try {
    const orgs = await linkedInJson<{ elements?: { organizationalTarget?: string }[] }>(
      "/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
      token.access_token,
    );
    for (const element of orgs.elements ?? []) {
      const urn = element.organizationalTarget;
      if (!urn?.startsWith("urn:li:organization:")) continue;
      const id = urn.split(":").at(-1) || urn;
      let displayName = `LinkedIn organization ${id}`;
      try {
        const organization = await linkedInJson<{ localizedName?: string; name?: { localized?: Record<string, string> } }>(`/rest/organizations/${id}`, token.access_token);
        displayName = organization.localizedName || Object.values(organization.name?.localized ?? {})[0] || displayName;
      } catch {
        // The organization id is enough to publish. A missing name does not block the connection.
      }
      await db.socialConnection.upsert({
        where: { businessId_platform_externalId: { businessId: ctx.business.id, platform: "LINKEDIN", externalId: urn } },
        create: {
          businessId: ctx.business.id,
          platform: "LINKEDIN",
          status: "CONNECTED",
          externalId: urn,
          displayName,
          accountKind: "ORGANIZATION",
          accessTokenCipher: sealSocialToken(token.access_token, key),
          refreshTokenCipher: token.refresh_token ? sealSocialToken(token.refresh_token, key) : null,
          tokenExpiresAt: expiresAt,
          connectedAt: new Date(),
          lastSyncAt: new Date(),
          lastSyncStatus: "ok",
        },
        update: {
          status: "CONNECTED",
          displayName,
          accessTokenCipher: sealSocialToken(token.access_token, key),
          refreshTokenCipher: token.refresh_token ? sealSocialToken(token.refresh_token, key) : null,
          tokenExpiresAt: expiresAt,
          disconnectedAt: null,
          lastSyncError: null,
          connectedAt: new Date(),
          lastSyncAt: new Date(),
          lastSyncStatus: "ok",
        },
      });
      connected.push({ platform: "LINKEDIN", externalId: urn });
    }
  } catch (error) {
    await db.socialConnection.updateMany({
      where: { businessId: ctx.business.id, platform: "LINKEDIN", externalId: `urn:li:person:${sub}` },
      data: { lastSyncError: safeSocialMessage(error instanceof Error ? error.message : "Organization list failed") },
    });
  }
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "SETTINGS_CHANGE",
    entity: "SocialConnection",
    details: socialAuditDetails({
      kind: "SOCIAL_CONNECTED",
      platform: "LINKEDIN",
      results: connected.map((row) => ({ platform: row.platform, status: "CONNECTED" })),
    }),
  });
  return { connected: connected.length };
}

export async function disconnectSocial(ctx: AuthContext, connectionId: string) {
  assertManage(ctx);
  const connection = await db.socialConnection.findFirst({ where: { id: connectionId, ...socialConnectionWhere(ctx.business.id) } });
  if (!connection) throw new Error("Social account not found");
  await db.socialConnection.update({
    where: { id: connection.id },
    data: {
      status: "DISCONNECTED",
      accessTokenCipher: null,
      refreshTokenCipher: null,
      tokenExpiresAt: null,
      disconnectedAt: new Date(),
      lastSyncStatus: "ok",
    },
  });
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "SETTINGS_CHANGE",
    entity: "SocialConnection",
    entityId: connection.id,
    details: socialAuditDetails({ kind: "SOCIAL_DISCONNECTED", platform: connection.platform, connectionId: connection.id, externalId: connection.externalId }),
  });
  return { status: "DISCONNECTED" as const };
}

export async function refreshSocial(ctx: AuthContext, connectionId: string) {
  assertManage(ctx);
  const connection = await db.socialConnection.findFirst({ where: { id: connectionId, businessId: ctx.business.id, status: "CONNECTED" } });
  if (!connection) throw new Error("Social account not found");
  const config = await (connection.platform === "LINKEDIN" ? loadLinkedInConfig() : loadMetaConfig());
  const key = requireKey(config, connection.platform === "LINKEDIN" ? "linkedin" : "meta");
  try {
    const token = await usableToken(connection, key);
    let displayName = connection.displayName;
    if (connection.platform === "FACEBOOK") {
      const page = await metaGet<{ name?: string }>(`/${connection.externalId}?fields=name`, token);
      displayName = page.name || displayName;
    } else if (connection.platform === "INSTAGRAM") {
      const account = await metaGet<{ username?: string }>(`/${connection.externalId}?fields=username`, token);
      displayName = account.username ? `@${account.username}` : displayName;
    } else if (connection.accountKind === "PROFILE") {
      const profile = await readJson(await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } }));
      if (typeof profile.name === "string") displayName = profile.name;
    }
    await db.socialConnection.update({
      where: { id: connection.id },
      data: { displayName, lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncError: null, status: "CONNECTED" },
    });
  } catch (error) {
    const message = safeSocialMessage(error instanceof Error ? error.message : "refresh failed");
    await db.socialConnection.update({
      where: { id: connection.id },
      data: { status: (error as AuthError).auth ? "ERROR" : connection.status, lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message },
    });
    throw new Error(message.startsWith("Invalid social:") ? message : `Invalid social: ${message}`);
  }
  return { id: connection.id };
}

function cleanLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Invalid social post: the link must be an http(s) URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid social post: the link must be an http(s) URL");
  return url.toString();
}

export async function createSocialPost(
  ctx: AuthContext,
  input: { body: string; linkUrl?: string | null; scheduledFor?: string | null; connectionIds: string[]; image?: { name: string; mime: string; data: Buffer } | null },
) {
  assertPublish(ctx);
  const text = input.body.trim();
  const link = cleanLink(input.linkUrl);
  if (input.image && (!IMAGE_MIME.has(input.image.mime) || input.image.data.byteLength === 0 || input.image.data.byteLength > IMAGE_LIMIT)) {
    throw new Error("Invalid social post: use a JPEG, PNG, or WebP image up to 4 MB");
  }
  if (!text && !link && !input.image) throw new Error("Invalid social post: add text, an image, or a link");
  if (text.length > 63206) throw new Error("Invalid social post: text is longer than Facebook allows");
  if (input.connectionIds.length === 0) throw new Error("Invalid social post: select a connected account");
  const connections = await db.socialConnection.findMany({
    where: { ...socialConnectionWhere(ctx.business.id), id: { in: input.connectionIds }, status: "CONNECTED" },
  });
  if (connections.length !== new Set(input.connectionIds).size) throw new Error("Invalid social post: select a connected account");
  let scheduledFor: Date | null = null;
  if (input.scheduledFor) {
    scheduledFor = new Date(input.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) throw new Error("Invalid social post: scheduled time is not a date");
  }
  const schedule = Boolean(scheduledFor && scheduledFor.getTime() > Date.now() + 15_000);
  const post = await db.socialPost.create({
    data: {
      businessId: ctx.business.id,
      createdById: ctx.employee.id,
      body: text,
      linkUrl: link,
      imageName: input.image?.name ?? null,
      imageMime: input.image?.mime ?? null,
      imageData: input.image?.data ?? null,
      status: schedule ? "SCHEDULED" : "PUBLISHING",
      scheduledFor: schedule ? scheduledFor : new Date(),
      deliveries: {
        create: connections.map((connection) => ({
          businessId: ctx.business.id,
          connectionId: connection.id,
          platform: connection.platform,
          status: schedule ? "SCHEDULED" : "SCHEDULED",
        })),
      },
    },
    include: { deliveries: true },
  });
  if (schedule) {
    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "SETTINGS_CHANGE",
      entity: "SocialPost",
      entityId: post.id,
      details: socialAuditDetails({
        kind: "SOCIAL_SCHEDULED",
        postId: post.id,
        results: post.deliveries.map((delivery) => ({ platform: delivery.platform, status: "SCHEDULED" })),
      }),
    });
    return { id: post.id, status: "SCHEDULED" as const };
  }
  await publishClaimedPost(post.id, ctx.business.id, ctx.employee.id);
  const saved = await db.socialPost.findFirst({ where: { id: post.id, businessId: ctx.business.id }, select: { status: true } });
  return { id: post.id, status: saved?.status ?? "FAILED" };
}

export async function retrySocialDelivery(ctx: AuthContext, postId: string, deliveryId: string) {
  assertPublish(ctx);
  const delivery = await db.socialDelivery.findFirst({
    where: { id: deliveryId, postId, businessId: ctx.business.id },
    include: { post: true, connection: true },
  });
  if (!delivery) throw new Error("Social delivery not found");
  if (delivery.status !== "FAILED") throw new Error("Invalid social post: only a failed platform can be retried");
  if (delivery.connection.status !== "CONNECTED" || !delivery.connection.accessTokenCipher) {
    throw new Error("Invalid social: that account is not connected");
  }
  const result = await sendDelivery(delivery.post, delivery.connection);
  await db.socialDelivery.update({
    where: { id: delivery.id },
    data: {
      status: result.status,
      externalPostId: result.externalPostId ?? null,
      error: result.error ?? null,
      publishedAt: result.status === "PUBLISHED" ? new Date() : null,
    },
  });
  await recomputePost(delivery.postId, ctx.business.id);
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "SETTINGS_CHANGE",
    entity: "SocialDelivery",
    entityId: delivery.id,
    details: socialAuditDetails({
      kind: "SOCIAL_RETRY",
      postId: delivery.postId,
      results: [{ platform: delivery.platform, status: result.status, error: result.error }],
    }),
  });
  return { id: delivery.id, status: result.status, error: result.error ?? null };
}

export async function publishDueSocialPosts(businessId?: string) {
  const due = await db.socialPost.findMany({
    where: {
      ...(businessId ? socialPostWhere(businessId) : {}),
      status: "SCHEDULED",
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
    take: businessId ? 5 : 10,
    select: { id: true, businessId: true, createdById: true },
  });
  let published = 0;
  for (const post of due) {
    const claimed = await db.socialPost.updateMany({
      where: { id: post.id, businessId: post.businessId, status: "SCHEDULED" },
      data: { status: "PUBLISHING" },
    });
    if (claimed.count !== 1) continue;
    try {
      await publishClaimedPost(post.id, post.businessId, post.createdById);
      published += 1;
    } catch (error) {
      await db.socialPost.update({
        where: { id: post.id },
        data: { status: "FAILED" },
      });
      await createAuditLog({
        businessId: post.businessId,
        employeeId: post.createdById,
        action: "SETTINGS_CHANGE",
        entity: "SocialPost",
        entityId: post.id,
        details: socialAuditDetails({ kind: "SOCIAL_PUBLISHED", postId: post.id, error: error instanceof Error ? error.message : "publish failed" }),
      });
    }
  }
  return { published };
}

async function publishClaimedPost(postId: string, businessId: string, employeeId: string) {
  const post = await db.socialPost.findFirst({
    where: { id: postId, businessId },
    include: { deliveries: { include: { connection: true } } },
  });
  if (!post) return;
  const results: { platform: string; status: "PUBLISHED" | "FAILED"; error?: string }[] = [];
  for (const delivery of post.deliveries) {
    if (delivery.status === "PUBLISHED") {
      results.push({ platform: delivery.platform, status: "PUBLISHED" });
      continue;
    }
    const result = await sendDelivery(post, delivery.connection);
    await db.socialDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.status,
        externalPostId: result.externalPostId ?? null,
        error: result.error ?? null,
        publishedAt: result.status === "PUBLISHED" ? new Date() : null,
      },
    });
    results.push({ platform: delivery.platform, status: result.status, error: result.error });
  }
  const status = summarizeDeliveries(results.map((result) => result.status));
  await db.socialPost.update({ where: { id: post.id }, data: { status } });
  await createAuditLog({
    businessId,
    employeeId,
    action: "SETTINGS_CHANGE",
    entity: "SocialPost",
    entityId: post.id,
    details: socialAuditDetails({ kind: "SOCIAL_PUBLISHED", postId: post.id, results }),
  });
}

async function recomputePost(postId: string, businessId: string) {
  const deliveries = await db.socialDelivery.findMany({ where: { postId, businessId }, select: { status: true } });
  const status = summarizeDeliveries(deliveries.map((delivery) => delivery.status));
  await db.socialPost.updateMany({ where: { id: postId, businessId }, data: { status } });
}

async function usableToken(
  connection: { id: string; platform: SocialPlatformName; accessTokenCipher: string | null; refreshTokenCipher: string | null; tokenExpiresAt: Date | null },
  key: Buffer,
): Promise<string> {
  if (!connection.accessTokenCipher) throw authError("auth expired");
  const token = openSocialToken(connection.accessTokenCipher, key);
  if (connection.platform !== "LINKEDIN") return token;
  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() > Date.now() + 60_000) return token;
  if (!connection.refreshTokenCipher) throw authError("auth expired");
  const config = await loadLinkedInConfig();
  requireKey(config, "linkedin");
  const refreshed = await linkedInToken(
    config,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: openSocialToken(connection.refreshTokenCipher, key),
      client_id: config.clientId as string,
      client_secret: config.clientSecret as string,
    }),
  );
  await db.socialConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenCipher: sealSocialToken(refreshed.access_token, key),
      refreshTokenCipher: refreshed.refresh_token ? sealSocialToken(refreshed.refresh_token, key) : connection.refreshTokenCipher,
      tokenExpiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : connection.tokenExpiresAt,
    },
  });
  return refreshed.access_token;
}

async function sendDelivery(
  post: { id: string; businessId: string; body: string; linkUrl: string | null; imageName: string | null; imageMime: string | null; imageData: Uint8Array | null },
  connection: {
    id: string;
    platform: SocialPlatformName;
    status: string;
    externalId: string;
    accountKind: string;
    accessTokenCipher: string | null;
    refreshTokenCipher: string | null;
    tokenExpiresAt: Date | null;
  },
): Promise<{ status: "PUBLISHED" | "FAILED"; externalPostId?: string; error?: string }> {
  const issue = platformIssue(connection.platform, { text: post.body, link: post.linkUrl, hasImage: Boolean(post.imageData?.byteLength) });
  if (issue) return { status: "FAILED", error: issue };
  if (connection.status !== "CONNECTED") return { status: "FAILED", error: "auth expired" };
  const config = await (connection.platform === "LINKEDIN" ? loadLinkedInConfig() : loadMetaConfig());
  if (!config.encryptionKey) return { status: "FAILED", error: "Social token encryption is not configured" };
  try {
    const token = await usableToken(connection, config.encryptionKey);
    const externalPostId = await publishToPlatform(post, connection, token);
    await db.socialConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncError: null, status: "CONNECTED" },
    });
    return { status: "PUBLISHED", externalPostId };
  } catch (error) {
    const message = safeSocialMessage(error instanceof Error ? error.message : "publish failed");
    if ((error as AuthError).auth) {
      await db.socialConnection.update({
        where: { id: connection.id },
        data: { status: "ERROR", lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message },
      });
      return { status: "FAILED", error: "auth expired" };
    }
    return { status: "FAILED", error: message };
  }
}

async function publishToPlatform(
  post: { id: string; businessId: string; body: string; linkUrl: string | null; imageName: string | null; imageMime: string | null; imageData: Uint8Array | null },
  connection: { platform: SocialPlatformName; externalId: string },
  token: string,
): Promise<string> {
  if (connection.platform === "FACEBOOK") return publishFacebook(post, connection.externalId, token);
  if (connection.platform === "INSTAGRAM") return publishInstagram(post, connection.externalId, token);
  return publishLinkedIn(post, connection.externalId, token);
}

async function publishFacebook(
  post: { body: string; linkUrl: string | null; imageName: string | null; imageMime: string | null; imageData: Uint8Array | null },
  pageId: string,
  token: string,
): Promise<string> {
  if (post.imageData?.byteLength) {
    const form = new FormData();
    const caption = [post.body, post.linkUrl].filter(Boolean).join("\n");
    if (caption) form.set("message", caption);
    form.set("source", new Blob([new Uint8Array(post.imageData)], { type: post.imageMime || "image/jpeg" }), post.imageName || "image.jpg");
    const created = await metaPost<{ id?: string }>(`/${pageId}/photos`, token, form);
    if (!created.id) throw new Error("Facebook did not return a post id");
    return created.id;
  }
  const created = await metaPost<{ id?: string }>(`/${pageId}/feed`, token, {
    message: post.body || post.linkUrl || "",
    ...(post.linkUrl ? { link: post.linkUrl } : {}),
  });
  if (!created.id) throw new Error("Facebook did not return a post id");
  return created.id;
}

async function publishInstagram(
  post: { id: string; businessId: string; body: string; linkUrl: string | null; imageMime: string | null; imageData: Uint8Array | null },
  igUserId: string,
  token: string,
): Promise<string> {
  if (!post.imageData?.byteLength) throw new Error("Instagram feed posts need an image");
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blobToken) throw new Error("Instagram needs a public image URL. Set BLOB_READ_WRITE_TOKEN. Other platforms can still publish.");
  const extension = post.imageMime === "image/png" ? "png" : post.imageMime === "image/webp" ? "webp" : "jpg";
  const blob = await put(`business/${post.businessId}/social/${post.id}.${extension}`, Buffer.from(post.imageData), {
    access: "public",
    token: blobToken,
    contentType: post.imageMime || "image/jpeg",
  });
  const container = await metaPost<{ id?: string }>(`/${igUserId}/media`, token, {
    image_url: blob.url,
    caption: composedCaption("INSTAGRAM", post.body, post.linkUrl),
  });
  if (!container.id) throw new Error("Instagram did not accept the image");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const status = await metaGet<{ status_code?: string }>(`/${container.id}?fields=status_code`, token);
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR") throw new Error("Instagram rejected the image");
    if (attempt === 2) throw new Error("Instagram is still processing the image. Retry Instagram.");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const published = await metaPost<{ id?: string }>(`/${igUserId}/media_publish`, token, { creation_id: container.id });
  if (!published.id) throw new Error("Instagram did not return a post id");
  return published.id;
}

async function publishLinkedIn(
  post: { body: string; linkUrl: string | null; imageMime: string | null; imageData: Uint8Array | null },
  author: string,
  token: string,
): Promise<string> {
  const commentary = post.body || post.linkUrl || "";
  const payload: Record<string, unknown> = {
    author,
    commentary,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (post.imageData?.byteLength) {
    const initialized = await linkedInJson<{ value?: { uploadUrl?: string; image?: string } }>("/rest/images?action=initializeUpload", token, {
      method: "POST",
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    });
    const uploadUrl = initialized.value?.uploadUrl;
    const image = initialized.value?.image;
    if (!uploadUrl || !image) throw new Error("LinkedIn did not accept the image");
    const uploaded = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": post.imageMime || "image/jpeg" },
      body: new Uint8Array(post.imageData),
    });
    if (!uploaded.ok) throw new Error("LinkedIn image upload failed");
    payload.content = { media: { id: image } };
  } else if (post.linkUrl) {
    payload.content = { article: { source: post.linkUrl, title: post.linkUrl } };
  }
  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202510",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const json = await readJson(response);
    const message = typeof json.message === "string" ? json.message : "LinkedIn publish failed";
    throw response.status === 401 ? authError(message) : new Error(safeSocialMessage(message));
  }
  return response.headers.get("x-restli-id") || response.headers.get("x-linkedin-id") || "linkedin-post";
}

function serializeAccount(account: {
  id: string;
  platform: SocialPlatformName;
  status: string;
  displayName: string;
  accountKind: string;
  externalId: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}) {
  return {
    id: account.id,
    platform: account.platform,
    status: account.status,
    displayName: account.displayName,
    accountKind: account.accountKind,
    externalId: account.externalId,
    lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: account.lastSyncStatus,
    lastSyncError: account.lastSyncError,
  };
}

export async function socialOverview(ctx: AuthContext) {
  assertSocialView(ctx);
  await publishDueSocialPosts(ctx.business.id);
  const [accounts, posts] = await Promise.all([
    db.socialConnection.findMany({
      where: socialConnectionWhere(ctx.business.id),
      orderBy: [{ platform: "asc" }, { displayName: "asc" }],
    }),
    db.socialPost.findMany({
      where: socialPostWhere(ctx.business.id),
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        deliveries: { include: { connection: { select: { displayName: true } } } },
      },
    }),
  ]);
  const meta = await loadMetaConfig();
  const linkedin = await loadLinkedInConfig();
  const metaGate = socialConnectGate(meta, "meta");
  const linkedInGate = socialConnectGate(linkedin, "linkedin");
  const admin = ctx.isPlatformAdmin;
  return {
    meta: {
      ready: meta.ready,
      missing: admin ? meta.missing : [],
      message: metaGate.message,
      redirectUri: admin ? meta.redirectUri : null,
    },
    linkedin: {
      ready: linkedin.ready,
      missing: admin ? linkedin.missing : [],
      message: linkedInGate.message,
      redirectUri: admin ? linkedin.redirectUri : null,
    },
    accounts: accounts.map(serializeAccount),
    posts: posts.map((post) => ({
      id: post.id,
      body: post.body,
      linkUrl: post.linkUrl,
      hasImage: Boolean(post.imageName),
      status: post.status,
      scheduledFor: post.scheduledFor?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      deliveries: post.deliveries.map((delivery) => ({
        id: delivery.id,
        platform: delivery.platform,
        status: delivery.status,
        error: delivery.error,
        displayName: delivery.connection.displayName,
        publishedAt: delivery.publishedAt?.toISOString() ?? null,
      })),
    })),
  };
}

export async function readSocialImage(ctx: AuthContext, postId: string) {
  assertPublish(ctx);
  const post = await db.socialPost.findFirst({
    where: { id: postId, ...socialPostWhere(ctx.business.id) },
    select: { imageData: true, imageMime: true, imageName: true },
  });
  if (!post?.imageData) throw new Error("Social image not found");
  return { data: Buffer.from(post.imageData), mime: post.imageMime || "image/jpeg", name: post.imageName || "image" };
}
