export type ContactCardInput = {
  name: string;
  jobTitle?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  organization?: string | null;
};

function escapeVCard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Work contact only. Payroll, birth date, and emergency contacts stay out. */
export function buildVCard(input: ContactCardInput): string {
  const [first, ...rest] = input.name.trim().split(/\s+/);
  const last = rest.join(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(input.name.trim())}`,
    `N:${escapeVCard(last)};${escapeVCard(first ?? "")};;;`,
  ];
  if (input.organization) lines.push(`ORG:${escapeVCard(input.organization)}`);
  if (input.jobTitle) lines.push(`TITLE:${escapeVCard(input.jobTitle)}`);
  if (input.department) lines.push(`ROLE:${escapeVCard(input.department)}`);
  if (input.phone) lines.push(`TEL;TYPE=WORK:${escapeVCard(input.phone)}`);
  if (input.email) lines.push(`EMAIL;TYPE=WORK:${escapeVCard(input.email)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}
