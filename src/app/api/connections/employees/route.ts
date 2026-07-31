import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { listConnectionEmployees } from "@/lib/connections/service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const employees = await listConnectionEmployees(ctx);
    return NextResponse.json(employees.filter((employee) => employee.id !== ctx.employee.id));
  } catch (error) {
    return handleApiError(error, "GET /api/connections/employees");
  }
}
