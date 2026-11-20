const NOMINATIM_UA = "EmeraldOne-POS/1.0 (contact@emeraldvalestudios.online)";
const METERS_PER_MILE = 1609.344;

type NominatimHit = { lat?: string; lon?: string };

async function geocode(address: string, label: string): Promise<{ lat: number; lon: number }> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  const response = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Could not look up the ${label} address. Try again in a moment.`);
  }
  const hits = (await response.json().catch(() => null)) as NominatimHit[] | null;
  const lat = Number(hits?.[0]?.lat);
  const lon = Number(hits?.[0]?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`No match for the ${label} address. Check the spelling and try a fuller US address.`);
  }
  return { lat, lon };
}

export async function drivingMiles(origin: string, destination: string): Promise<number> {
  const from = origin.trim();
  const to = destination.trim();
  if (!from || !to) throw new Error("Enter an origin and destination");
  const start = await geocode(from, "origin");
  const end = await geocode(to, "destination");
  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
  const response = await fetch(routeUrl, { headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" } });
  const body = (await response.json().catch(() => null)) as {
    code?: string;
    routes?: Array<{ distance?: number }>;
  } | null;
  const meters = body?.routes?.[0]?.distance;
  if (!response.ok || body?.code !== "Ok" || meters == null || !Number.isFinite(meters)) {
    throw new Error("Could not calculate a driving route between those addresses.");
  }
  return Math.round((meters / METERS_PER_MILE) * 10) / 10;
}
