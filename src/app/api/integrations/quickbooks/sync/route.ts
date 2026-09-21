import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { assertImportEntity, canConnectQuickBooks } from "@/lib/import/access";
import { pullQuickBooksEntity } from "@/lib/integrations/quickbooks-service";

const schema = z.object({ entity: z.enum(["Customer", "Vendor", "Item", "Purchase"]) });
const LOCAL: Record<string, string> = { Customer: "CUSTOMER", Vendor: "VENDOR", Item: "PRODUCT", Purchase: "EXPENSE" };

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!canConnectQuickBooks(ctx)) throw new Error("Missing permission: manage_locations");
    const data = schema.parse(await request.json());
    assertImportEntity(ctx, LOCAL[data.entity]);
    const result = await pullQuickBooksEntity({ businessId: ctx.business.id, employeeId: ctx.employee.id, entity: data.entity });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/integrations/quickbooks/sync");
  }
}
