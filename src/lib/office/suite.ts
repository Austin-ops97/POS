export type OfficeSuiteIcon =
  | "files" | "document" | "sheet" | "presentation" | "pdf" | "message"
  | "calendar" | "customers" | "forms" | "finance" | "projects" | "people"
  | "knowledge" | "security" | "automation" | "utilities" | "tasks";

export type OfficeSuiteGroup = "Create & organize" | "Communicate & serve" | "Run the business" | "Manage & protect";
export type OfficeDelivery = "built-in" | "connected";

export type OfficeSuiteModule = {
  slug: string;
  name: string;
  eyebrow: string;
  description: string;
  icon: OfficeSuiteIcon;
  group: OfficeSuiteGroup;
  accent: string;
  delivery: OfficeDelivery;
  nativeHref?: string;
  features: string[];
  quickActions: Array<{ label: string; href?: string }>;
};

export const OFFICE_SUITE_GROUPS: OfficeSuiteGroup[] = [
  "Create & organize", "Communicate & serve", "Run the business", "Manage & protect",
];

export const CUSTOM_OFFICE_WORKSPACES = [
  "spreadsheets", "presentations", "communication", "calendar", "forms-approvals",
  "task-assignments", "projects", "automations-ai", "utilities",
] as const;

export const OFFICE_SUITE_MODULES: OfficeSuiteModule[] = [
  {
    slug: "files", name: "Files", eyebrow: "Find and organize", icon: "files", group: "Create & organize", accent: "sky", delivery: "connected",
    description: "Organize documents in folders, add tags, search, preview, download, and restore versions.", nativeHref: "/office/documents",
    features: ["Folders and tags", "Search and previews", "Downloads and version history"],
    quickActions: [{ label: "Browse files", href: "/office/documents" }, { label: "Upload file", href: "/office/documents?upload=1" }],
  },
  {
    slug: "documents", name: "Documents", eyebrow: "Write and reuse", icon: "document", group: "Create & organize", accent: "blue", delivery: "connected",
    description: "Create rich-text business documents, use templates, organize drafts, and keep saved versions.", nativeHref: "/office/documents",
    features: ["Rich-text editor", "Reusable templates", "Autosave and versions"],
    quickActions: [{ label: "New document", href: "/office/new" }, { label: "Open library", href: "/office/documents" }],
  },
  {
    slug: "spreadsheets", name: "Spreadsheets", eyebrow: "Calculate and export", icon: "sheet", group: "Create & organize", accent: "emerald", delivery: "built-in",
    description: "Edit a saved grid, use common formulas, paste tabular data, and import or export CSV files.",
    features: ["Editable cell grid", "SUM, AVERAGE, MIN, MAX", "CSV import and export"],
    quickActions: [{ label: "New workbook" }, { label: "Open workbooks" }],
  },
  {
    slug: "presentations", name: "Presentations", eyebrow: "Build and present", icon: "presentation", group: "Create & organize", accent: "orange", delivery: "built-in",
    description: "Create saved slide decks with layouts and speaker notes, then present full-screen or print to PDF.",
    features: ["Slide editor", "Speaker notes", "Present and print"],
    quickActions: [{ label: "New deck" }, { label: "Open decks" }],
  },
  {
    slug: "pdf-scanner", name: "Document scanner", eyebrow: "Capture paper", icon: "pdf", group: "Create & organize", accent: "rose", delivery: "connected",
    description: "Capture or upload multiple page images, improve contrast, rotate, reorder, download, and retain scans.", nativeHref: "/office/scan",
    features: ["Camera and photo capture", "Contrast and grayscale", "Rotate, reorder, and download"],
    quickActions: [{ label: "Start scanning", href: "/office/scan" }, { label: "View scans", href: "/office/scan" }],
  },
  {
    slug: "communication", name: "Communication", eyebrow: "Draft with control", icon: "message", group: "Communicate & serve", accent: "violet", delivery: "built-in",
    description: "Write and save email drafts or internal announcements. External email requires review and explicit confirmation.",
    features: ["Saved drafts", "Internal announcements", "Confirmed email sending when configured"],
    quickActions: [{ label: "Compose message" }, { label: "View drafts" }],
  },
  {
    slug: "calendar", name: "Appointments", eyebrow: "Book without conflicts", icon: "calendar", group: "Communicate & serve", accent: "indigo", delivery: "built-in",
    description: "Schedule saved customer appointments, assign a team member, track status, and catch time conflicts.",
    features: ["Appointment scheduling", "Team assignment", "Conflict warnings"],
    quickActions: [{ label: "Book appointment" }, { label: "View schedule" }],
  },
  {
    slug: "task-assignments", name: "Task assignments", eyebrow: "Assign work to people", icon: "tasks", group: "Communicate & serve", accent: "teal", delivery: "built-in",
    description: "Assign a saved task to a worker, notify them, collect completion photos, and keep finished work on its own tab.",
    features: ["Assign to a worker", "In-app and email notice", "Complete with photo and checklist", "Finished tab and cleanup"],
    quickActions: [{ label: "Assign a task" }, { label: "By worker" }],
  },
  {
    slug: "crm-sales", name: "Customers", eyebrow: "Know the customer", icon: "customers", group: "Communicate & serve", accent: "cyan", delivery: "connected",
    description: "Maintain customer profiles, contact details, tags, notes, and connected order history.", nativeHref: "/customers",
    features: ["Customer profiles", "Notes and tags", "Order history"],
    quickActions: [{ label: "Customer directory", href: "/customers" }, { label: "Add customer", href: "/customers/new" }],
  },
  {
    slug: "forms-approvals", name: "Forms", eyebrow: "Collect structured answers", icon: "forms", group: "Communicate & serve", accent: "fuchsia", delivery: "built-in",
    description: "Build a saved form with required fields, preview it, collect responses, and review submissions.",
    features: ["Form builder", "Live preview", "Saved responses"],
    quickActions: [{ label: "Build form" }, { label: "Review responses" }],
  },
  {
    slug: "accounting", name: "Expenses & budgets", eyebrow: "Control spending", icon: "finance", group: "Run the business", accent: "emerald", delivery: "connected",
    description: "Submit expenses and receipts, route approvals, manage cards and reimbursements, and compare budgets.", nativeHref: "/finance/expenses",
    features: ["Expenses and receipts", "Approval workflow", "Budgets and reports"],
    quickActions: [{ label: "Add expense", href: "/finance/expenses/new" }, { label: "Open finance", href: "/finance/expenses" }],
  },
  {
    slug: "projects", name: "Projects", eyebrow: "Move work forward", icon: "projects", group: "Run the business", accent: "amber", delivery: "built-in",
    description: "Create saved projects with owners, deadlines, tasks, checklists, priorities, and a visual board.",
    features: ["Project board", "Tasks and checklists", "Owners and due dates"],
    quickActions: [{ label: "New project" }, { label: "Open board" }],
  },
  {
    slug: "people-admin", name: "People & workforce", eyebrow: "Run the team", icon: "people", group: "Run the business", accent: "teal", delivery: "connected",
    description: "Manage employee profiles, roles, wages, schedules, time clock, time off, and payroll records.", nativeHref: "/employees",
    features: ["Employee directory", "Scheduling and time clock", "Time off and payroll"],
    quickActions: [{ label: "Employee directory", href: "/employees" }, { label: "Team schedule", href: "/workforce" }],
  },
  {
    slug: "knowledge", name: "Knowledge", eyebrow: "Document how work happens", icon: "knowledge", group: "Run the business", accent: "lime", delivery: "connected",
    description: "Use documents, folders, tags, templates, and search to maintain operating procedures and company notes.", nativeHref: "/office/documents",
    features: ["Procedure documents", "Folders and tags", "Templates and search"],
    quickActions: [{ label: "New procedure", href: "/office/new" }, { label: "Search knowledge", href: "/office/documents" }],
  },
  {
    slug: "security", name: "Register security", eyebrow: "Protect sensitive actions", icon: "security", group: "Manage & protect", accent: "slate", delivery: "connected",
    description: "Configure register PIN controls, refund approval, and automatic session timeout.", nativeHref: "/settings/security",
    features: ["Register PIN policy", "Refund approval", "Session timeout"],
    quickActions: [{ label: "Security settings", href: "/settings/security" }],
  },
  {
    slug: "automations-ai", name: "Workflow automations", eyebrow: "Repeat work reliably", icon: "automation", group: "Manage & protect", accent: "purple", delivery: "built-in",
    description: "Build saved, manual workflows from supported internal actions and review every run before it changes data.",
    features: ["Saved workflow rules", "Manual confirmed runs", "Run history"],
    quickActions: [{ label: "Build workflow" }, { label: "View run history" }],
  },
  {
    slug: "utilities", name: "Everyday utilities", eyebrow: "Useful tools in one place", icon: "utilities", group: "Manage & protect", accent: "zinc", delivery: "built-in",
    description: "Calculate percentages, convert units, make QR codes, resize images, package ZIP files, and scan barcodes.",
    features: ["Calculator and converters", "QR and barcode tools", "Image resize and ZIP creation"],
    quickActions: [{ label: "Open calculator" }, { label: "Create QR code" }],
  },
];

export function getOfficeSuiteModule(slug: string) {
  return OFFICE_SUITE_MODULES.find((module) => module.slug === slug);
}

export function isCustomOfficeWorkspace(slug: string): slug is (typeof CUSTOM_OFFICE_WORKSPACES)[number] {
  return CUSTOM_OFFICE_WORKSPACES.includes(slug as (typeof CUSTOM_OFFICE_WORKSPACES)[number]);
}

export function officeModuleHref(module: OfficeSuiteModule) {
  return module.nativeHref ?? `/office/apps/${module.slug}`;
}
