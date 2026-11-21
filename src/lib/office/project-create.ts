export type ProjectOrderLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ProjectOrderTotals = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

export type ProjectCreateDraft = {
  title: string;
  description: string;
  customerId: string;
  clientName: string;
  startsAt: string;
  dueAt: string;
  priority: string;
  assignedToId: string;
  sourceOrderId?: string;
  sourceOrderNumber?: string;
  address?: string;
  orderLines?: ProjectOrderLine[];
  orderTotals?: ProjectOrderTotals;
};

export type ProjectCreateInput = {
  title: string;
  summary: string;
  status: "ACTIVE";
  priority: string;
  dueAt: string | null;
  assignedToId: string | null;
  metadata: {
    tasks: [];
    color: "amber";
    customerId: string | null;
    customerName: string | null;
    startsAt: string | null;
    sourceOrderId: string | null;
    sourceOrderNumber: string | null;
    address: string | null;
    orderLines: ProjectOrderLine[];
    orderTotals: ProjectOrderTotals | null;
  };
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "URGENT"]);

export function buildProjectRecordInput(
  draft: ProjectCreateDraft
): { ok: true; input: ProjectCreateInput } | { ok: false; error: string } {
  const title = draft.title.trim();
  if (!title) return { ok: false, error: "Enter a project name." };
  if (title.length > 160) return { ok: false, error: "Project name must be 160 characters or fewer." };

  const description = draft.description.trim();
  if (description.length > 2000) {
    return { ok: false, error: "Description must be 2,000 characters or fewer." };
  }

  const startsAt = draft.startsAt.trim();
  const dueAt = draft.dueAt.trim();
  if (startsAt && !DATE_ONLY.test(startsAt)) return { ok: false, error: "Enter a valid start date." };
  if (dueAt && !DATE_ONLY.test(dueAt)) return { ok: false, error: "Enter a valid due date." };
  if (startsAt && dueAt && startsAt > dueAt) {
    return { ok: false, error: "The due date can't be before the start date." };
  }

  const priority = PRIORITIES.has(draft.priority) ? draft.priority : "NORMAL";
  const customerId = draft.customerId.trim();
  const assignedToId = draft.assignedToId.trim();
  // A directory customer wins. The typed name is only kept when nobody was selected.
  const clientName = customerId ? null : normalizeProjectClientName(draft.clientName);

  return {
    ok: true,
    input: {
      title,
      summary: description,
      status: "ACTIVE",
      priority,
      dueAt: dueAt ? new Date(`${dueAt}T00:00:00.000Z`).toISOString() : null,
      assignedToId: assignedToId || null,
      metadata: {
        tasks: [],
        color: "amber",
        customerId: customerId || null,
        customerName: clientName,
        startsAt: startsAt || null,
        sourceOrderId: draft.sourceOrderId?.trim() || null,
        sourceOrderNumber: draft.sourceOrderNumber?.trim() || null,
        address: draft.address?.trim() || null,
        orderLines: draft.orderLines ?? [],
        orderTotals: draft.orderTotals ?? null,
      },
    },
  };
}

/** Server-side schedule check. Throws messages that the API maps to a 400 response. */
export function normalizeProjectSchedule(startsAt: unknown, dueAt: Date | null | undefined): string | null {
  if (startsAt == null || startsAt === "") return null;
  if (typeof startsAt !== "string" || !DATE_ONLY.test(startsAt.trim())) {
    throw new Error("Invalid start date");
  }
  const value = startsAt.trim();
  if (dueAt) {
    const dueKey = dueAt.toISOString().slice(0, 10);
    if (value > dueKey) {
      throw new Error("Invalid project dates: the due date can't be before the start date");
    }
  }
  return value;
}

/** Trimmed display name for a client who is not in the customer directory. */
export function normalizeProjectClientName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return name || null;
}

export function projectCustomerName(metadata: Record<string, unknown> | null | undefined): string | null {
  const name = typeof metadata?.customerName === "string" ? metadata.customerName.trim() : "";
  return name || null;
}

export function projectStartDate(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = typeof metadata?.startsAt === "string" ? metadata.startsAt : "";
  return DATE_ONLY.test(value.slice(0, 10)) ? value.slice(0, 10) : null;
}

export function projectSourceOrder(
  metadata: Record<string, unknown> | null | undefined
): { id: string; number: string } | null {
  const id = typeof metadata?.sourceOrderId === "string" ? metadata.sourceOrderId.trim() : "";
  const number = typeof metadata?.sourceOrderNumber === "string" ? metadata.sourceOrderNumber.trim() : "";
  if (!id) return null;
  return { id, number: number || id };
}

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function orderSnapshotForProject(order: {
  orderNumber: string;
  subtotal?: unknown;
  discountAmount?: unknown;
  taxAmount?: unknown;
  total?: unknown;
  items?: Array<{ name: string; quantity: number; unitPrice?: unknown; total?: unknown }>;
}): { description: string; orderLines: ProjectOrderLine[]; orderTotals: ProjectOrderTotals } {
  const orderLines = (order.items ?? []).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: money(item.unitPrice),
    total: money(item.total),
  }));
  const orderTotals = {
    subtotal: money(order.subtotal),
    discountAmount: money(order.discountAmount),
    taxAmount: money(order.taxAmount),
    total: money(order.total),
  };
  const lines = orderLines.map(
    (item) => `${item.quantity} × ${item.name} @ ${item.unitPrice.toFixed(2)} = ${item.total.toFixed(2)}`
  );
  const totals = [
    `Subtotal ${orderTotals.subtotal.toFixed(2)}`,
    orderTotals.discountAmount ? `Discount ${orderTotals.discountAmount.toFixed(2)}` : null,
    `Tax ${orderTotals.taxAmount.toFixed(2)}`,
    `Total ${orderTotals.total.toFixed(2)}`,
  ].filter(Boolean);
  const description = [`Source order ${order.orderNumber}`, ...lines, totals.join(" · ")].join("\n");
  return { description: description.slice(0, 2000), orderLines, orderTotals };
}

export function formatProjectDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
