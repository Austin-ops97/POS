import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { PERMISSIONS } from "@/lib/permissions";
import { ocrParseSchema } from "@/lib/validations/expenses";
import { parseOcrPayload } from "@/lib/expenses/receipt-service";
import { resolveCategorySuggestion } from "@/lib/expenses/expense-service";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.CREATE_EXPENSE)) {
      throw new Error(`Missing permission: ${PERMISSIONS.CREATE_EXPENSE}`);
    }
    const rl = checkRateLimit(`expense:ocr:${ctx.employee.id}`, 40, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many OCR requests", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }
    const body = ocrParseSchema.parse(await request.json());
    const parsed = parseOcrPayload(body);
    const category = await resolveCategorySuggestion(
      ctx.business.id,
      parsed.categorySuggestion
    );
    return NextResponse.json({ ...parsed, categoryId: category?.id ?? null });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/ocr");
  }
}
