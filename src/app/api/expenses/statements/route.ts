import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createBankStatement, listBankStatements } from "@/lib/expenses/bank-statement-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    const statements = await listBankStatements(ctx);
    return NextResponse.json(
      statements.map(({ data: _data, ...statement }) => {
        void _data;
        return statement;
      })
    );
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/statements");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const rl = await checkRateLimitAsync(`expense:statement:${ctx.employee.id}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
    }
    const created = await createBankStatement(ctx, await request.json());
    const { data: _data, ...statement } = created;
    void _data;
    return NextResponse.json(statement, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/statements");
  }
}
