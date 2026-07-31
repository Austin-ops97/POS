import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { CUSTOMER_CONFIGURABLE_MODULES } from "@/lib/modules";
import { getBusinessModuleAccess } from "@/lib/access-control";
import { handleApiError } from "@/lib/api-utils";
import { assertEmployeeManagementAllowed } from "@/lib/employee-security";

type RouteParams = { params: Promise<{ id: string }> };
const keys = CUSTOMER_CONFIGURABLE_MODULES.map((item) => item.key);
const schema = z.object({
  modules: z.array(z.object({ module: z.enum(keys as [typeof keys[number], ...typeof keys[number][]]), enabled: z.boolean() })),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES);
    const { id } = await params;
    const data = schema.parse(await request.json());
    const employee = await db.employeeProfile.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
      include: { role: { select: { name: true } } },
    });
    if (!employee) throw new Error("Employee not found");
    assertEmployeeManagementAllowed(ctx, employee.role.name);
    const licensed = await getBusinessModuleAccess(ctx.business.id);

    await db.$transaction(
      data.modules.map(({ module, enabled }) =>
        db.employeeModuleAccess.upsert({
          where: { employeeId_module: { employeeId: id, module } },
          create: { employeeId: id, module, enabled: licensed[module] && enabled },
          update: { enabled: licensed[module] && enabled },
        })
      )
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "PATCH /api/employees/[id]/modules");
  }
}
