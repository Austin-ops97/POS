import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requirePermission } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { resolveRegisterCashier } from "@/lib/register-cashier";
import { verifyLocationAccess } from "@/lib/order-service";
import {
  addCashMovement,
  closeRegisterSession,
  getOpenRegisterSession,
  openRegisterSession,
  serializeRegisterSession,
} from "@/lib/register-session";

const openSchema = z.object({
  locationId: z.string().min(1),
  openingCash: z.number().min(0).default(0),
});

const closeSchema = z.object({
  sessionId: z.string().min(1),
  actualCash: z.number().min(0),
});

const movementSchema = z.object({
  sessionId: z.string().min(1),
  type: z.enum(["PAID_IN", "PAID_OUT"]),
  amount: z.number().positive(),
  reason: z.string().max(200).optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.OPEN_REGISTER);
    const cashier = await resolveRegisterCashier(ctx, request);

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId");
    if (!locationId) {
      return jsonError("locationId is required", 400);
    }
    await verifyLocationAccess(ctx, locationId);

    const session = await getOpenRegisterSession(
      ctx.business.id,
      locationId,
      cashier.id
    );

    return NextResponse.json({
      session: session ? serializeRegisterSession(session) : null,
      cashier,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/register/session");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.OPEN_REGISTER);
    const cashier = await resolveRegisterCashier(ctx, request);
    const body = await request.json();
    const action = body?.action as string | undefined;

    if (action === "open") {
      const data = openSchema.parse(body);
      await verifyLocationAccess(ctx, data.locationId);
      const session = await openRegisterSession({
        businessId: ctx.business.id,
        locationId: data.locationId,
        employeeId: cashier.id,
        openingCash: data.openingCash,
      });
      return NextResponse.json({ session: serializeRegisterSession(session) });
    }

    if (action === "close") {
      const data = closeSchema.parse(body);
      const session = await closeRegisterSession({
        businessId: ctx.business.id,
        sessionId: data.sessionId,
        employeeId: cashier.id,
        actualCash: data.actualCash,
      });
      return NextResponse.json({ session: serializeRegisterSession(session) });
    }

    if (action === "movement") {
      const data = movementSchema.parse(body);
      const session = await addCashMovement({
        businessId: ctx.business.id,
        sessionId: data.sessionId,
        type: data.type,
        amount: data.amount,
        reason: data.reason,
      });
      return NextResponse.json({ session: serializeRegisterSession(session) });
    }

    return jsonError("Unknown action. Use open, close, or movement.", 400);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (
        error.message === "Register session is already open" ||
        error.message === "Open register session not found" ||
        error.message === "Amount must be greater than zero"
      ) {
        return jsonError(error.message, 400);
      }
    }
    return handleApiError(error, "POST /api/register/session");
  }
}
