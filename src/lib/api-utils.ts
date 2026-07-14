import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { OrderServiceError } from "./order-service";

export type ApiErrorBody = {
  error: string;
  code: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
};

export function apiError(
  message: string,
  status: number,
  extra?: Partial<ApiErrorBody>
) {
  return NextResponse.json(
    {
      error: message,
      code: extra?.code ?? `HTTP_${status}`,
      ...extra,
    } satisfies ApiErrorBody,
    { status }
  );
}

export const jsonError = apiError;

export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_form";
    fieldErrors[path] = fieldErrors[path] ?? [];
    fieldErrors[path].push(issue.message);
  }
  return fieldErrors;
}

function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
  status: number;
  message: string;
  code: string;
} | null {
  switch (error.code) {
    case "P2002":
      return {
        status: 409,
        message: "A record with this value already exists",
        code: "UNIQUE_CONSTRAINT",
      };
    case "P2003":
      return {
        status: 422,
        message: "Referenced record is missing or invalid",
        code: "FOREIGN_KEY",
      };
    case "P2025":
      return { status: 404, message: "Record not found", code: "NOT_FOUND" };
    case "P2021":
      return {
        status: 503,
        message: "The Workforce database migration has not been applied",
        code: "MIGRATION_REQUIRED",
      };
    case "P2022":
      return {
        status: 503,
        message: "Database schema is out of date. Run migrations.",
        code: "SCHEMA_OUT_OF_DATE",
      };
    default:
      return null;
  }
}

export function handleApiError(error: unknown, context: string) {
  const requestId = randomUUID();

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation error",
        code: "VALIDATION_ERROR",
        fieldErrors: zodFieldErrors(error),
        requestId,
      } satisfies ApiErrorBody,
      { status: 400 }
    );
  }

  if (error instanceof OrderServiceError) {
    return apiError(error.message, error.statusCode, { code: "ORDER_ERROR", requestId });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(error);
    if (mapped) {
      console.error(`${context} [${requestId}] Prisma ${error.code}:`, error.meta);
      return apiError(mapped.message, mapped.status, { code: mapped.code, requestId });
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error(`${context} [${requestId}]:`, error.message);
    return apiError("Unable to connect to the database. Try again.", 503, {
      code: "DATABASE_UNAVAILABLE",
      requestId,
    });
  }

  if (error instanceof Error) {
    if (error.message === "Unauthorized") {
      return apiError("Unauthorized", 401, { code: "UNAUTHORIZED", requestId });
    }
    if (error.message.startsWith("Missing permission:")) {
      const perm = error.message.replace("Missing permission: ", "");
      return apiError(`You do not have permission: ${perm}`, 403, {
        code: "FORBIDDEN",
        requestId,
      });
    }
    if (error.message === "Not authorized to cancel this request") {
      return apiError(error.message, 403, { code: "FORBIDDEN", requestId });
    }
    if (error.message.includes("Stripe is not configured")) {
      return apiError(error.message, 503, { code: "STRIPE_UNAVAILABLE", requestId });
    }
    if (
      error.name === "PrismaClientInitializationError" ||
      error.message.includes("DATABASE_URL")
    ) {
      return apiError(
        "Database is not configured. Set DATABASE_URL in your environment.",
        503,
        { code: "DATABASE_NOT_CONFIGURED", requestId }
      );
    }
    if ("type" in error && typeof error.type === "string" && error.type.startsWith("Stripe")) {
      return apiError(error.message, 502, { code: "STRIPE_ERROR", requestId });
    }
  }

  console.error(`${context} [${requestId}]:`, error);
  return apiError("Internal server error", 500, { code: "INTERNAL_ERROR", requestId });
}
