import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OrderServiceError } from "./order-service";

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export const jsonError = apiError;

export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

export function handleApiError(error: unknown, context: string) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation error", details: error.flatten() },
      { status: 400 }
    );
  }

  if (error instanceof OrderServiceError) {
    return apiError(error.message, error.statusCode);
  }

  if (error instanceof Error) {
    if (error.message === "Unauthorized") {
      return apiError("Unauthorized", 401);
    }
    if (error.message.startsWith("Missing permission:")) {
      return apiError(error.message, 403);
    }
    if (error.message.includes("Stripe is not configured")) {
      return apiError(error.message, 503);
    }
    if (
      error.name === "PrismaClientInitializationError" ||
      error.message.includes("DATABASE_URL")
    ) {
      return apiError(
        "Database is not configured. Set DATABASE_URL in your environment.",
        503
      );
    }
    if ("type" in error && typeof error.type === "string" && error.type.startsWith("Stripe")) {
      return apiError(error.message, 502);
    }
  }

  console.error(`${context}:`, error);
  return apiError("Internal server error", 500);
}
