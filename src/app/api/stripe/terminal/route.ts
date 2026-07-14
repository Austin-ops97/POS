import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { getStripeOrThrow } from "@/lib/stripe";
import { z } from "zod";

type ReaderStatus = "ONLINE" | "OFFLINE" | "BUSY" | "NEEDS_UPDATE";

const registerReaderSchema = z.object({
  action: z.literal("register"),
  registrationCode: z.string().min(1),
  label: z.string().min(1),
  locationId: z.string().optional(),
});

const connectionTokenSchema = z.object({
  action: z.literal("connection_token"),
  locationId: z.string().optional(),
});

const terminalPostSchema = z.discriminatedUnion("action", [
  registerReaderSchema,
  connectionTokenSchema,
]);

function mapReaderStatus(status: string): ReaderStatus {
  const map: Record<string, ReaderStatus> = {
    online: "ONLINE",
    offline: "OFFLINE",
    busy: "BUSY",
    unknown: "OFFLINE",
  };
  return map[status] ?? "OFFLINE";
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.MANAGE_STRIPE);

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId") ?? undefined;

    const readers = await db.terminalReader.findMany({
      where: {
        businessId: ctx.business.id,
        ...(locationId ? { locationId } : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const stripeAccount = await db.stripeAccount.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (stripeAccount?.stripeAccountId) {
      try {
        const stripe = getStripeOrThrow();
        const list = await stripe.terminal.readers.list(
          { limit: 100 },
          { stripeAccount: stripeAccount.stripeAccountId }
        );

        for (const sr of list.data) {
          const local = readers.find((r) => r.stripeReaderId === sr.id);
          if (local) {
            await db.terminalReader.update({
              where: { id: local.id },
              data: {
                status: mapReaderStatus(sr.status ?? "offline"),
                lastActiveAt: new Date(),
              },
            });
          }
        }
      } catch (err) {
        console.warn("Failed to sync readers from Stripe:", err);
      }
    }

    const updatedReaders = await db.terminalReader.findMany({
      where: {
        businessId: ctx.business.id,
        ...(locationId ? { locationId } : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      readers: updatedReaders.map((reader) => ({
        id: reader.id,
        name: reader.name,
        serialNumber: reader.serialNumber,
        stripeReaderId: reader.stripeReaderId,
        status: reader.status,
        isDefault: reader.isDefault,
        location: reader.location,
        lastActiveAt: reader.lastActiveAt,
        createdAt: reader.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/stripe/terminal");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.MANAGE_STRIPE);

    const body = await request.json();
    const parsed = terminalPostSchema.parse(body);

    const stripeAccount = await db.stripeAccount.findUnique({
      where: { businessId: ctx.business.id },
    });

    if (!stripeAccount?.stripeAccountId) {
      return jsonError("Stripe Connect account required for Terminal", 400);
    }

    const stripe = getStripeOrThrow();

    if (parsed.action === "connection_token") {
      const token = await stripe.terminal.connectionTokens.create(
        {},
        { stripeAccount: stripeAccount.stripeAccountId }
      );

      return NextResponse.json({
        secret: token.secret,
      });
    }

    if (parsed.locationId) {
      const location = await db.location.findFirst({
        where: {
          id: parsed.locationId,
          businessId: ctx.business.id,
        },
      });
      if (!location) {
        return jsonError("Location not found", 404);
      }
    }

    const reader = await stripe.terminal.readers.create(
      {
        registration_code: parsed.registrationCode,
        label: parsed.label,
        metadata: {
          businessId: ctx.business.id,
          locationId: parsed.locationId ?? "",
        },
      },
      { stripeAccount: stripeAccount.stripeAccountId }
    );

    const terminalReader = await db.terminalReader.create({
      data: {
        businessId: ctx.business.id,
        locationId: parsed.locationId,
        stripeReaderId: reader.id,
        name: parsed.label,
        serialNumber: reader.serial_number ?? undefined,
        status: mapReaderStatus(reader.status ?? "offline"),
        lastActiveAt: new Date(),
      },
      include: {
        location: { select: { id: true, name: true } },
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "CREATE",
      entity: "TerminalReader",
      entityId: terminalReader.id,
      details: {
        stripeReaderId: reader.id,
        label: parsed.label,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      reader: {
        id: terminalReader.id,
        name: terminalReader.name,
        serialNumber: terminalReader.serialNumber,
        stripeReaderId: terminalReader.stripeReaderId,
        status: terminalReader.status,
        location: terminalReader.location,
      },
    });
  } catch (error) {
    return handleApiError(error, "POST /api/stripe/terminal");
  }
}
