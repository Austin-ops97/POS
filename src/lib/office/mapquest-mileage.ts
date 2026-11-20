export const MAPQUEST_KEY_MISSING =
  "MapQuest is not configured. Set MAPQUEST_API_KEY on the server to calculate driving miles.";

export function mapquestConfigured() {
  return Boolean(process.env.MAPQUEST_API_KEY?.trim());
}

export async function drivingMiles(origin: string, destination: string): Promise<number> {
  const key = process.env.MAPQUEST_API_KEY?.trim();
  if (!key) throw new Error(MAPQUEST_KEY_MISSING);
  const from = origin.trim();
  const to = destination.trim();
  if (!from || !to) throw new Error("Enter an origin and destination");
  const url = new URL("https://www.mapquestapi.com/directions/v2/route");
  url.searchParams.set("key", key);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("unit", "m");
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as {
    info?: { statuscode?: number; messages?: string[] };
    route?: { distance?: number };
  } | null;
  const status = body?.info?.statuscode ?? response.status;
  if (!response.ok || (status && status >= 400) || body?.route?.distance == null) {
    throw new Error(body?.info?.messages?.[0] || "MapQuest could not calculate that route");
  }
  return Math.round(Number(body.route.distance) * 10) / 10;
}
