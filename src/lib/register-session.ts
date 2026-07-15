import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toDecimal } from "@/lib/order-service";

export async function getOpenRegisterSession(
  businessId: string,
  locationId: string,
  employeeId?: string
) {
  return db.registerSession.findFirst({
    where: {
      businessId,
      locationId,
      status: "OPEN",
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      employee: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      cashMovements: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { openedAt: "desc" },
  });
}

export async function openRegisterSession(input: {
  businessId: string;
  locationId: string;
  employeeId: string;
  openingCash: number;
}) {
  const existing = await getOpenRegisterSession(
    input.businessId,
    input.locationId,
    input.employeeId
  );
  if (existing) {
    throw new Error("Register session is already open");
  }

  return db.$transaction(async (tx) => {
    const session = await tx.registerSession.create({
      data: {
        businessId: input.businessId,
        locationId: input.locationId,
        employeeId: input.employeeId,
        status: "OPEN",
        openingCash: toDecimal(input.openingCash),
      },
      include: {
        employee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (input.openingCash !== 0) {
      await tx.cashMovement.create({
        data: {
          registerSessionId: session.id,
          type: "OPENING",
          amount: toDecimal(input.openingCash),
          reason: "Opening float",
        },
      });
    }

    return session;
  });
}

export function expectedCashOnHand(session: {
  openingCash: Prisma.Decimal | number;
  cashSales: Prisma.Decimal | number;
  cashRefunds: Prisma.Decimal | number;
  paidIn: Prisma.Decimal | number;
  paidOut: Prisma.Decimal | number;
}) {
  return (
    Number(session.openingCash) +
    Number(session.cashSales) -
    Number(session.cashRefunds) +
    Number(session.paidIn) -
    Number(session.paidOut)
  );
}

export async function closeRegisterSession(input: {
  businessId: string;
  sessionId: string;
  employeeId: string;
  actualCash: number;
}) {
  const session = await db.registerSession.findFirst({
    where: {
      id: input.sessionId,
      businessId: input.businessId,
      status: "OPEN",
    },
  });

  if (!session) {
    throw new Error("Open register session not found");
  }

  const expected = expectedCashOnHand(session);
  const overShort = Math.round((input.actualCash - expected) * 100) / 100;

  return db.$transaction(async (tx) => {
    await tx.cashMovement.create({
      data: {
        registerSessionId: session.id,
        type: "CLOSING",
        amount: toDecimal(input.actualCash),
        reason: "Closing count",
      },
    });

    return tx.registerSession.update({
      where: { id: session.id },
      data: {
        status: "CLOSED",
        expectedCash: toDecimal(expected),
        actualCash: toDecimal(input.actualCash),
        overShort: toDecimal(overShort),
        closedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        cashMovements: { orderBy: { createdAt: "asc" } },
      },
    });
  });
}

export async function addCashMovement(input: {
  businessId: string;
  sessionId: string;
  type: "PAID_IN" | "PAID_OUT";
  amount: number;
  reason?: string;
}) {
  if (input.amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const session = await db.registerSession.findFirst({
    where: {
      id: input.sessionId,
      businessId: input.businessId,
      status: "OPEN",
    },
  });
  if (!session) {
    throw new Error("Open register session not found");
  }

  return db.$transaction(async (tx) => {
    await tx.cashMovement.create({
      data: {
        registerSessionId: session.id,
        type: input.type,
        amount: toDecimal(input.amount),
        reason: input.reason,
      },
    });

    return tx.registerSession.update({
      where: { id: session.id },
      data:
        input.type === "PAID_IN"
          ? { paidIn: { increment: toDecimal(input.amount) } }
          : { paidOut: { increment: toDecimal(input.amount) } },
      include: {
        employee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        cashMovements: { orderBy: { createdAt: "asc" } },
      },
    });
  });
}

export function serializeRegisterSession(session: {
  id: string;
  status: string;
  openingCash: Prisma.Decimal | number;
  cashSales: Prisma.Decimal | number;
  cashRefunds: Prisma.Decimal | number;
  paidIn: Prisma.Decimal | number;
  paidOut: Prisma.Decimal | number;
  expectedCash?: Prisma.Decimal | number | null;
  actualCash?: Prisma.Decimal | number | null;
  overShort?: Prisma.Decimal | number | null;
  openedAt: Date;
  closedAt?: Date | null;
  employee?: { id: string; name: string };
  location?: { id: string; name: string };
  cashMovements?: Array<{
    id: string;
    type: string;
    amount: Prisma.Decimal | number;
    reason: string | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: session.id,
    status: session.status,
    openingCash: Number(session.openingCash),
    cashSales: Number(session.cashSales),
    cashRefunds: Number(session.cashRefunds),
    paidIn: Number(session.paidIn),
    paidOut: Number(session.paidOut),
    expectedCash:
      session.expectedCash != null
        ? Number(session.expectedCash)
        : expectedCashOnHand(session),
    actualCash: session.actualCash != null ? Number(session.actualCash) : null,
    overShort: session.overShort != null ? Number(session.overShort) : null,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    employee: session.employee,
    location: session.location,
    cashMovements: (session.cashMovements || []).map((m) => ({
      id: m.id,
      type: m.type,
      amount: Number(m.amount),
      reason: m.reason,
      createdAt: m.createdAt,
    })),
  };
}
