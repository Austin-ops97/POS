import { db } from "./db";

export const AUTO_PROVISIONED_BUSINESS_NAME = "My Business";

type MembershipCandidate = {
  id: string;
  businessId: string;
  createdAt: Date;
  joinedAt: Date | null;
  defaultLocationId: string | null;
  role: { name: string };
  business: {
    name: string;
    _count: {
      products: number;
      inventoryItems: number;
      orders: number;
      employees: number;
    };
  };
  locations: { locationId: string }[];
};

function isEmptyAutoProvisionedShell(membership: MembershipCandidate): boolean {
  const { business, role } = membership;
  if (role.name !== "Owner") return false;
  if (business.name !== AUTO_PROVISIONED_BUSINESS_NAME) return false;
  return (
    business._count.products === 0 &&
    business._count.inventoryItems === 0 &&
    business._count.orders === 0 &&
    business._count.employees <= 1
  );
}

function membershipScore(membership: MembershipCandidate): number {
  // Prefer real/shared businesses over empty auto-provisioned shells.
  let score = 0;
  if (!isEmptyAutoProvisionedShell(membership)) score += 100;
  if (membership.joinedAt) score += 20;
  if (membership.business.name !== AUTO_PROVISIONED_BUSINESS_NAME) score += 10;
  return score;
}

function sortMemberships(a: MembershipCandidate, b: MembershipCandidate) {
  const scoreDiff = membershipScore(b) - membershipScore(a);
  if (scoreDiff !== 0) return scoreDiff;
  const aJoined = a.joinedAt?.getTime() ?? 0;
  const bJoined = b.joinedAt?.getTime() ?? 0;
  if (bJoined !== aJoined) return bJoined - aJoined;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

const membershipInclude = {
  role: { select: { name: true } },
  business: {
    select: {
      name: true,
      _count: {
        select: {
          products: true,
          inventoryItems: true,
          orders: true,
          employees: true,
        },
      },
    },
  },
  locations: { take: 1, orderBy: { locationId: "asc" as const } },
};

/**
 * Prefer the shared/invited business when a user has multiple ACTIVE memberships.
 * Empty auto-provisioned "My Business" shells lose to real workplaces.
 */
export async function findPreferredActiveMembership(userId: string) {
  const memberships = await db.employeeProfile.findMany({
    where: {
      userId,
      status: "ACTIVE",
      deletedAt: null,
      business: { status: "ACTIVE", deletedAt: null },
    },
    include: membershipInclude,
    orderBy: { createdAt: "asc" },
  });

  if (!memberships.length) return null;
  return [...memberships].sort(sortMemberships)[0] ?? null;
}

/**
 * Retire empty auto-provisioned Owner shells so invitees stay on the shared business.
 */
export async function retireEmptyAutoProvisionedMemberships(
  userId: string,
  keepEmployeeId: string
) {
  const memberships = await db.employeeProfile.findMany({
    where: {
      userId,
      status: "ACTIVE",
      deletedAt: null,
      id: { not: keepEmployeeId },
    },
    include: membershipInclude,
  });

  const retiredBusinessIds: string[] = [];

  for (const membership of memberships) {
    if (!isEmptyAutoProvisionedShell(membership)) continue;

    await db.employeeProfile.update({
      where: { id: membership.id },
      data: {
        status: "INACTIVE",
        deletedAt: new Date(),
      },
    });

    await db.business.update({
      where: { id: membership.businessId },
      data: {
        status: "SUSPENDED",
        deletedAt: new Date(),
      },
    });

    retiredBusinessIds.push(membership.businessId);
  }

  return retiredBusinessIds;
}

/**
 * Activate pending INVITED profiles that match the signed-in user's email.
 * This keeps invitees on the owner's business instead of creating a blank one.
 */
export async function claimPendingInvitationsForUser(user: {
  id: string;
  email: string;
}) {
  const pending = await db.employeeProfile.findMany({
    where: {
      email: { equals: user.email, mode: "insensitive" },
      status: "INVITED",
      deletedAt: null,
      userId: null,
      inviteExpiresAt: { gt: new Date() },
      business: { status: "ACTIVE", deletedAt: null },
    },
    include: {
      business: { select: { id: true, name: true } },
      locations: { take: 1, orderBy: { locationId: "asc" } },
    },
    orderBy: { invitedAt: "desc" },
  });

  if (!pending.length) return [] as typeof pending;

  const claimed = [];
  for (const invite of pending) {
    const updated = await db.employeeProfile.update({
      where: { id: invite.id },
      data: {
        userId: user.id,
        status: "ACTIVE",
        joinedAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
      include: {
        business: { select: { id: true, name: true } },
        locations: { take: 1, orderBy: { locationId: "asc" } },
      },
    });
    claimed.push(updated);
  }

  if (claimed[0]) {
    await retireEmptyAutoProvisionedMemberships(user.id, claimed[0].id);
  }

  return claimed;
}
