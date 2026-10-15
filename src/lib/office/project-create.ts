export type ProjectCreateDraft = {
  title: string;
  description: string;
  customerId: string;
  startsAt: string;
  dueAt: string;
  priority: string;
  assignedToId: string;
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
    startsAt: string | null;
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
    return { ok: false, error: "Start date must be on or before the due date." };
  }

  const priority = PRIORITIES.has(draft.priority) ? draft.priority : "NORMAL";
  const customerId = draft.customerId.trim();
  const assignedToId = draft.assignedToId.trim();

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
        startsAt: startsAt || null,
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
      throw new Error("Invalid project dates: the start date must be on or before the due date");
    }
  }
  return value;
}

export function projectCustomerName(metadata: Record<string, unknown> | null | undefined): string | null {
  const name = typeof metadata?.customerName === "string" ? metadata.customerName.trim() : "";
  return name || null;
}

export function projectStartDate(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = typeof metadata?.startsAt === "string" ? metadata.startsAt : "";
  return DATE_ONLY.test(value.slice(0, 10)) ? value.slice(0, 10) : null;
}

export function formatProjectDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
