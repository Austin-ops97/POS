import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, canManageBusinessProfile } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { createAuditLog } from "@/lib/audit";
import { businessProfileSchema } from "@/lib/validations";

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!canManageBusinessProfile(ctx)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data = businessProfileSchema.parse(body);

    const business = await db.business.update({
      where: { id: ctx.business.id },
      data: {
        name: data.name.trim(),
        type: data.type,
        legalName: data.legalName?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        website: data.website?.trim() || null,
        ...(data.primaryColor?.trim()
          ? { primaryColor: data.primaryColor.trim() }
          : {}),
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "UPDATE",
      entity: "Business",
      entityId: business.id,
      details: {
        name: business.name,
        type: business.type,
        legalName: business.legalName,
        phone: business.phone,
        email: business.email,
        website: business.website,
        primaryColor: business.primaryColor,
      },
    });

    return NextResponse.json({
      name: business.name,
      legalName: business.legalName,
      type: business.type,
      phone: business.phone,
      email: business.email,
      website: business.website,
      primaryColor: business.primaryColor,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    return handleApiError(error, "PATCH /api/business/profile");
  }
}
