import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { requireBuilder } from "@/lib/builder/gate";
import { clearPlatformProvider, platformCredentialCatalog, savePlatformProvider } from "@/lib/credentials/vault";
import { PLATFORM_PROVIDER_IDS } from "@/lib/credentials/catalog";

const saveSchema = z.object({
  provider: z.enum(PLATFORM_PROVIDER_IDS),
  values: z.record(z.string(), z.string().max(2048)).optional(),
});

export async function GET(request: Request) {
  try {
    await requireBuilder(request);
    return NextResponse.json(await platformCredentialCatalog());
  } catch (error) {
    return handleApiError(error, "GET /api/builder/credentials");
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireBuilder(request);
    const data = saveSchema.parse(await request.json());
    const catalog = await savePlatformProvider({
      provider: data.provider,
      values: data.values ?? {},
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIp(request),
    });
    return NextResponse.json(catalog);
  } catch (error) {
    return handleApiError(error, "PUT /api/builder/credentials");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireBuilder(request);
    const provider = new URL(request.url).searchParams.get("provider") ?? "";
    const catalog = await clearPlatformProvider({
      provider,
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIp(request),
    });
    return NextResponse.json(catalog);
  } catch (error) {
    return handleApiError(error, "DELETE /api/builder/credentials");
  }
}
