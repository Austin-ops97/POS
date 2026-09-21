export class BuilderGateError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "BuilderGateError";
    this.status = status;
    this.code = code;
  }
}

export function builderGateDecision(input: {
  authenticated: boolean;
  isPlatformAdmin: boolean;
  unlockConfigured: boolean;
  unlockValid: boolean;
}): { allow: true } | { allow: false; status: number; error: string; code: string } {
  if (!input.authenticated) {
    return { allow: false, status: 401, error: "Unauthorized", code: "UNAUTHORIZED" };
  }
  if (!input.isPlatformAdmin) {
    return {
      allow: false,
      status: 403,
      error: "Platform administrator required",
      code: "FORBIDDEN",
    };
  }
  if (!input.unlockConfigured) {
    return {
      allow: false,
      status: 503,
      error: "Builder unlock is not configured",
      code: "BUILDER_NOT_CONFIGURED",
    };
  }
  if (!input.unlockValid) {
    return {
      allow: false,
      status: 401,
      error: "Builder unlock required",
      code: "BUILDER_LOCKED",
    };
  }
  return { allow: true };
}
