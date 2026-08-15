import { jsonError } from "@/lib/api-utils";

export function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return jsonError("CRON_SECRET is not configured", 503);

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return jsonError("Unauthorized", 401);

  return null;
}
