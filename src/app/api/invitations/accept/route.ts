import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import {
  hashInvitationToken,
  invitationEmailMatches,
} from "@/lib/employee-invitations";
import {
  findPreferredActiveMembership,
  retireEmptyAutoProvisionedMemberships,
} from "@/lib/membership";

async function signedInEmails(fallback: string) {
  const emails = new Set<string>();
  if (fallback) emails.add(fallback);
  try {
    const clerkUser = await currentUser();
    if (clerkUser?.primaryEmailAddress?.emailAddress) {
      emails.add(clerkUser.primaryEmailAddress.emailAddress);
    }
    for (const item of clerkUser?.emailAddresses ?? []) {
      if (item.emailAddress) emails.add(item.emailAddress);
    }
  } catch {
    /* Clerk may be unset in local bypass */
  }
  return [...emails];
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });

    const employee = await db.employeeProfile.findUnique({
      where: { inviteTokenHash: hashInvitationToken(token) },
      include: { business: { select: { name: true, status: true } } },
    });

    if (!employee || employee.deletedAt || employee.business.status !== "ACTIVE") {
      return NextResponse.json({ valid: false, expired: true });
    }
    if (!employee.inviteExpiresAt || employee.inviteExpiresAt < new Date()) {
      return NextResponse.json({
        valid: false,
        expired: true,
        email: employee.email,
        businessName: employee.business.name,
      });
    }

    return NextResponse.json({
      valid: true,
      expired: false,
      email: employee.email,
      businessName: employee.business.name,
      status: employee.status,
      alreadyJoined: Boolean(employee.userId && employee.status === "ACTIVE"),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/invitations/accept");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) throw new Error("Unauthorized");
    const { token } = (await request.json()) as { token?: string };
    if (!token) return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });

    const emails = await signedInEmails(user.email);
    const employee = await db.employeeProfile.findUnique({
      where: { inviteTokenHash: hashInvitationToken(token) },
      include: { business: { select: { name: true, status: true } } },
    });

    if (!employee || !employee.inviteExpiresAt || employee.inviteExpiresAt < new Date() || employee.deletedAt) {
      const membership = await findPreferredActiveMembership(user.id);
      if (membership) {
        return NextResponse.json({
          success: true,
          alreadyMember: true,
          businessName: membership.business.name,
        });
      }
      return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 410 });
    }

    if (!invitationEmailMatches(employee.email, emails)) {
      return NextResponse.json(
        { error: `Sign in as ${employee.email} to accept this invitation` },
        { status: 403 }
      );
    }
    if (employee.business.status !== "ACTIVE") {
      return NextResponse.json({ error: "This business is not active" }, { status: 403 });
    }

    if (employee.userId && employee.userId !== user.id) {
      return NextResponse.json(
        { error: "This invitation was already accepted with a different login" },
        { status: 409 }
      );
    }

    if (employee.userId === user.id && employee.status === "ACTIVE") {
      await retireEmptyAutoProvisionedMemberships(user.id, employee.id);
      return NextResponse.json({ success: true, alreadyMember: true, businessName: employee.business.name });
    }

    await db.employeeProfile.update({
      where: { id: employee.id },
      data: {
        userId: user.id,
        status: "ACTIVE",
        joinedAt: employee.joinedAt ?? new Date(),
      },
    });

    // If sign-in auto-created an empty "My Business", retire it so the employee
    // stays connected to this shared business (inventory, products, etc.).
    await retireEmptyAutoProvisionedMemberships(user.id, employee.id);

    return NextResponse.json({ success: true, businessName: employee.business.name });
  } catch (error) {
    return handleApiError(error, "POST /api/invitations/accept");
  }
}
