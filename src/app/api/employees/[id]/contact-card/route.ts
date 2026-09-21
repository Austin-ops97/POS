import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { buildVCard } from "@/lib/workforce/vcard";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const allowed =
      id === ctx.employee.id ||
      hasPermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES) ||
      hasPermission(ctx, PERMISSIONS.VIEW_EMPLOYEE_PERSONAL) ||
      hasPermission(ctx, PERMISSIONS.VIEW_WORKFORCE);
    if (!allowed) throw new Error(`Missing permission: ${PERMISSIONS.VIEW_EMPLOYEE_PERSONAL}`);
    const employee = await db.employeeProfile.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
      select: {
        name: true,
        email: true,
        workEmail: true,
        phone: true,
        mobilePhone: true,
        jobTitle: true,
        department: true,
      },
    });
    if (!employee) throw new Error("Employee not found");
    const card = buildVCard({
      name: employee.name,
      jobTitle: employee.jobTitle,
      department: employee.department,
      email: employee.workEmail || employee.email,
      phone: employee.phone || employee.mobilePhone,
      organization: ctx.business.name,
    });
    const format = new URL(request.url).searchParams.get("format");
    if (format === "png") {
      const png = await QRCode.toBuffer(card, { type: "png", width: 360, margin: 1 });
      return new NextResponse(new Uint8Array(png), {
        headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
      });
    }
    const filename = `${employee.name.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "contact"}.vcf`;
    return new NextResponse(card, {
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/employees/[id]/contact-card");
  }
}
