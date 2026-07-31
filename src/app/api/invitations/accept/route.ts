import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { hashInvitationToken } from "@/lib/employee-invitations";

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) throw new Error("Unauthorized");
    const { token } = (await request.json()) as { token?: string };
    if (!token) return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });

    const employee = await db.employeeProfile.findUnique({
      where: { inviteTokenHash: hashInvitationToken(token) },
      include: { business: { select: { name: true, status: true } } },
    });
    if (!employee || !employee.inviteExpiresAt || employee.inviteExpiresAt < new Date()) {
      return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 410 });
    }
    if (employee.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: `Sign in as ${employee.email} to accept this invitation` }, { status: 403 });
    }
    if (employee.business.status !== "ACTIVE") {
      return NextResponse.json({ error: "This business is not active" }, { status: 403 });
    }

    await db.employeeProfile.update({
      where: { id: employee.id },
      data: {
        userId: user.id,
        status: "ACTIVE",
        joinedAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
    return NextResponse.json({ success: true, businessName: employee.business.name });
  } catch (error) {
    return handleApiError(error, "POST /api/invitations/accept");
  }
}
