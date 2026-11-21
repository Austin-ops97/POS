import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", database: { status: "ok", latencyMs: Date.now() - start } },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ status: "error", database: { status: "error" } }, { status: 503 });
  }
}
