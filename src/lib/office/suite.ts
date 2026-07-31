export type OfficeSuiteIcon =
  | "files"
  | "document"
  | "sheet"
  | "presentation"
  | "pdf"
  | "message"
  | "calendar"
  | "customers"
  | "forms"
  | "finance"
  | "projects"
  | "people"
  | "knowledge"
  | "security"
  | "automation"
  | "utilities";

export type OfficeSuiteGroup = "Create & organize" | "Communicate & serve" | "Run the business" | "Manage & protect";

export type OfficeSuiteModule = {
  slug: string;
  name: string;
  eyebrow: string;
  description: string;
  icon: OfficeSuiteIcon;
  group: OfficeSuiteGroup;
  accent: string;
  nativeHref?: string;
  nativeLabel?: string;
  features: string[];
  templates: Array<{ name: string; description: string }>;
  views: string[];
};

export const OFFICE_SUITE_GROUPS: OfficeSuiteGroup[] = [
  "Create & organize",
  "Communicate & serve",
  "Run the business",
  "Manage & protect",
];

export const OFFICE_SUITE_MODULES: OfficeSuiteModule[] = [
  {
    slug: "files",
    name: "Files & search",
    eyebrow: "One source of truth",
    description: "Organize every business file and find connected records from one secure workspace.",
    icon: "files",
    group: "Create & organize",
    accent: "sky",
    nativeHref: "/office/documents",
    nativeLabel: "Open document library",
    features: ["Shared folders and permissions", "Universal content search", "Tags, favorites, and previews", "Version history and recovery", "Secure external sharing", "Customer, employee, and project folders", "Offline-ready file queues", "Automatic backup policies"],
    templates: [
      { name: "Customer folder", description: "Contracts, communications, invoices, and service records." },
      { name: "Employee folder", description: "Private onboarding, acknowledgments, and certifications." },
      { name: "Project room", description: "Tasks, meeting notes, files, costs, and deadlines together." },
    ],
    views: ["Recent", "Shared", "Favorites", "Archived"],
  },
  {
    slug: "documents",
    name: "Documents",
    eyebrow: "Professional writing",
    description: "Draft polished letters, contracts, proposals, policies, reports, and reusable forms.",
    icon: "document",
    group: "Create & organize",
    accent: "blue",
    nativeHref: "/office/documents",
    nativeLabel: "Open document editor",
    features: ["Word and PDF import/export", "Proofreading assistance", "Headers, footers, and page numbers", "Tables, images, links, and signatures", "Comments and tracked revisions", "Autosave and version history", "Find and replace", "Print preview and page setup", "Full-screen editing", "Collaboration-ready document records"],
    templates: [
      { name: "Business proposal", description: "Branded scope, pricing, terms, and signature block." },
      { name: "Company policy", description: "Versioned policy with an owner and acknowledgment section." },
      { name: "Meeting notes", description: "Agenda, decisions, owners, and next actions." },
    ],
    views: ["Drafts", "Published", "Templates", "Shared"],
  },
  {
    slug: "spreadsheets",
    name: "Spreadsheets",
    eyebrow: "Structured analysis",
    description: "Build budgets, price lists, inventory trackers, schedules, and operating reports.",
    icon: "sheet",
    group: "Create & organize",
    accent: "emerald",
    features: ["Formulas and automatic totals", "Sorting and filtering", "Tables and charts", "CSV and Excel import/export", "Conditional formatting", "Data validation and dropdowns", "Frozen rows and columns", "Multiple sheets", "Protected cells", "Print areas and page breaks"],
    templates: [
      { name: "Monthly budget", description: "Budget versus actuals with category variance." },
      { name: "Inventory count", description: "SKU, expected quantity, counted quantity, and variance." },
      { name: "Team schedule", description: "Weekly staffing coverage and total hours." },
    ],
    views: ["My sheets", "Shared", "Templates", "Imports"],
  },
  {
    slug: "presentations",
    name: "Presentations",
    eyebrow: "Tell the story",
    description: "Create branded sales, training, investor, and employee presentations.",
    icon: "presentation",
    group: "Create & organize",
    accent: "orange",
    features: ["Branded themes and templates", "Flexible slide layouts", "Images, video, charts, and diagrams", "Speaker notes", "Presenter mode", "PowerPoint and PDF export"],
    templates: [
      { name: "Sales pitch", description: "Problem, solution, proof, offer, and next step." },
      { name: "Team training", description: "Learning goals, process walkthrough, and knowledge check." },
      { name: "Business review", description: "KPIs, progress, risks, and next-quarter priorities." },
    ],
    views: ["Recent", "Shared", "Brand kit", "Templates"],
  },
  {
    slug: "pdf-scanner",
    name: "PDF & scanner",
    eyebrow: "Paper, handled",
    description: "Scan, convert, assemble, protect, redact, sign, and extract information from PDFs.",
    icon: "pdf",
    group: "Create & organize",
    accent: "rose",
    nativeHref: "/office/scan",
    nativeLabel: "Scan a document",
    features: ["View, print, and download", "Combine, split, and reorder pages", "Compression and format conversion", "Text, highlights, and comments", "Fillable forms and electronic signatures", "Sensitive-data redaction", "Password protection", "Automatic edge and perspective correction", "Glare removal and document mode", "Multi-page scanning", "OCR and searchable PDFs", "Invoice, receipt, and business-card extraction"],
    templates: [
      { name: "Scan to customer", description: "Capture pages, run OCR, and file against a customer." },
      { name: "Receipt extraction", description: "Read merchant, date, tax, total, and expense category." },
      { name: "Secure signature packet", description: "Arrange documents, assign signers, and protect the result." },
    ],
    views: ["Scans", "Needs review", "Signed", "Conversions"],
  },
  {
    slug: "communication",
    name: "Email & messages",
    eyebrow: "Communication center",
    description: "Coordinate shared inboxes, team conversations, meetings, and follow-ups.",
    icon: "message",
    group: "Communicate & serve",
    accent: "violet",
    features: ["Shared support and billing inboxes", "Signatures, templates, and saved replies", "Scheduled sending and reminders", "Search, filters, spam controls, and labels", "Attachment previews", "Individual, group, and channel messaging", "Announcements and pinned messages", "Voice, video, and screen sharing", "Recording, captions, and transcripts", "AI summaries and action-item extraction", "Tasks created from messages"],
    templates: [
      { name: "Customer follow-up", description: "Personalized follow-up with an owner and reminder." },
      { name: "Team announcement", description: "Company-wide update with acknowledgment tracking." },
      { name: "Meeting recap", description: "Summary, decisions, action items, and linked recording." },
    ],
    views: ["Inbox", "Shared", "Channels", "Meetings"],
  },
  {
    slug: "calendar",
    name: "Calendar & booking",
    eyebrow: "Time, coordinated",
    description: "Manage team calendars, customer appointments, resources, reminders, and waitlists.",
    icon: "calendar",
    group: "Communicate & serve",
    accent: "indigo",
    nativeHref: "/workforce",
    nativeLabel: "Open team schedule",
    features: ["Personal, team, and company calendars", "Invitations and recurring events", "Availability and conflict warnings", "Time zones and calendar synchronization", "Customer booking links", "Room and equipment reservations", "Custom service duration and pricing", "Deposits and cancellation fees", "Email and text confirmations", "Rescheduling links", "Employee assignment and waitlists"],
    templates: [
      { name: "Customer appointment", description: "Service, employee, duration, deposit, and reminders." },
      { name: "Team meeting", description: "Availability-aware invite with agenda and meeting link." },
      { name: "Resource booking", description: "Reserve a room, vehicle, or piece of equipment." },
    ],
    views: ["Calendar", "Bookings", "Resources", "Waitlist"],
  },
  {
    slug: "crm-sales",
    name: "CRM & sales",
    eyebrow: "Relationships, connected",
    description: "Keep customers, conversations, opportunities, quotes, proposals, and follow-ups together.",
    icon: "customers",
    group: "Communicate & serve",
    accent: "cyan",
    nativeHref: "/customers",
    nativeLabel: "Open customer directory",
    features: ["Customer and company profiles", "Notes and interaction history", "Lead stages and opportunities", "Follow-up reminders", "Quotes, estimates, and proposals", "Email history and attachments", "Custom fields and segmentation", "Taxes, discounts, terms, and approval", "Branded proposal documents", "Convert approval to invoice or work order"],
    templates: [
      { name: "New opportunity", description: "Customer, stage, value, owner, and next action." },
      { name: "Estimate", description: "Products, services, taxes, discounts, terms, and approval." },
      { name: "Customer check-in", description: "Scheduled touchpoint linked to interaction history." },
    ],
    views: ["Pipeline", "Customers", "Quotes", "Follow-ups"],
  },
  {
    slug: "forms-approvals",
    name: "Forms & approvals",
    eyebrow: "Collect and decide",
    description: "Build conditional forms, collect signatures, route approvals, and retain completed copies.",
    icon: "forms",
    group: "Communicate & serve",
    accent: "fuchsia",
    features: ["Customer intake and job requests", "Employee onboarding", "Inspections and incident reports", "Surveys and consent forms", "Conditional questions", "Attachments and automatic routing", "PDF copies", "Signature fields, initials, and dates", "Multiple signers and signing order", "Approve, reject, and remind", "Tamper-evident audit records"],
    templates: [
      { name: "Customer intake", description: "Conditional intake with consent and file upload." },
      { name: "Purchase approval", description: "Amount-based routing with approve or reject steps." },
      { name: "Incident report", description: "People, location, evidence, follow-up, and signatures." },
    ],
    views: ["Forms", "Responses", "Approvals", "Signatures"],
  },
  {
    slug: "accounting",
    name: "Accounting",
    eyebrow: "Financial administration",
    description: "Track invoices, payments, expenses, books, tax, budgets, payroll, and reimbursements.",
    icon: "finance",
    group: "Run the business",
    accent: "emerald",
    nativeHref: "/finance/expenses",
    nativeLabel: "Open Finance",
    features: ["Branded and recurring invoices", "Payment links, deposits, and partial payments", "Tax, discounts, reminders, and statements", "Credit notes and payment status", "Receipt capture and OCR", "Project and customer expense links", "Employee reimbursements", "Income and expense tracking", "Profit and loss, cash flow, and balance sheet", "Bank reconciliation", "Sales-tax tracking", "Budget versus actual", "Accountant access and audit history", "Timesheets, overtime, PTO, and payroll export", "Job costing, breaks, and mileage"],
    templates: [
      { name: "Customer invoice", description: "Branded invoice with terms, tax, and payment link." },
      { name: "Monthly close", description: "Reconciliation, reporting, tax, and review checklist." },
      { name: "Expense reimbursement", description: "Receipt, category, business purpose, and approval." },
    ],
    views: ["Overview", "Invoices", "Expenses", "Reports"],
  },
  {
    slug: "projects",
    name: "Tasks & projects",
    eyebrow: "Work, made visible",
    description: "Coordinate tasks, projects, recurring procedures, costs, documents, and deadlines.",
    icon: "projects",
    group: "Run the business",
    accent: "amber",
    features: ["Owners, due dates, priorities, and statuses", "Checklists, attachments, comments, and reminders", "Complete activity history", "List, calendar, board, and timeline views", "Connected files, notes, meetings, and customers", "Employees, costs, invoices, and progress", "Recurring opening and closing duties", "Payroll and monthly reporting procedures", "Inspection, follow-up, onboarding, and compliance checklists"],
    templates: [
      { name: "Client project", description: "Milestones, tasks, files, meetings, cost, and invoice links." },
      { name: "Opening checklist", description: "Repeatable location opening duties with accountability." },
      { name: "Monthly reporting", description: "Close, reconcile, review KPIs, and distribute the report." },
    ],
    views: ["My work", "Board", "Timeline", "Procedures"],
  },
  {
    slug: "people-admin",
    name: "People & admin",
    eyebrow: "Employee operations",
    description: "Manage employee records, onboarding, access, equipment, certifications, and offboarding.",
    icon: "people",
    group: "Run the business",
    accent: "teal",
    nativeHref: "/employees",
    nativeLabel: "Open employee directory",
    features: ["Contact, role, department, manager, and start date", "Emergency contacts and certifications", "Assigned equipment", "Documents and acknowledgments", "Permission-controlled sensitive records", "Tax and employment forms", "Policy acknowledgment and training", "Account and equipment provisioning", "Access removal and final payroll", "Document-retention checklists"],
    templates: [
      { name: "Employee onboarding", description: "Forms, training, accounts, equipment, and introductions." },
      { name: "Employee offboarding", description: "Access removal, property return, final pay, and retention." },
      { name: "Certification renewal", description: "Expiration tracking with employee and manager reminders." },
    ],
    views: ["Directory", "Onboarding", "Equipment", "Compliance"],
  },
  {
    slug: "knowledge",
    name: "Notes & knowledge",
    eyebrow: "How the company works",
    description: "Capture notes and maintain a trustworthy, owned, versioned company operating manual.",
    icon: "knowledge",
    group: "Run the business",
    accent: "lime",
    nativeHref: "/office/documents",
    nativeLabel: "Open knowledge documents",
    features: ["Rich-text notes, folders, and tags", "Checklists, images, attachments, and backlinks", "Search and shared notebooks", "Voice-to-text and note templates", "Standard operating procedures", "Policies and software instructions", "Customer-service scripts", "Equipment and emergency instructions", "Frequently asked questions", "Version control and assigned document owners"],
    templates: [
      { name: "Standard procedure", description: "Purpose, owner, steps, controls, and revision schedule." },
      { name: "Meeting notebook", description: "Linked notes, decisions, questions, and tasks." },
      { name: "Service playbook", description: "Scripts, escalation paths, examples, and FAQs." },
    ],
    views: ["Notes", "Knowledge base", "Recently updated", "Needs review"],
  },
  {
    slug: "security",
    name: "Security & IT",
    eyebrow: "Protected by default",
    description: "Control identity, devices, sharing, retention, recovery, and auditable access.",
    icon: "security",
    group: "Manage & protect",
    accent: "slate",
    nativeHref: "/settings",
    nativeLabel: "Open security settings",
    features: ["Password-manager readiness", "Multi-factor authentication", "Automatic backups", "Endpoint and device inventory", "Role-based permission management", "Secure file sharing and encryption", "Login and audit history", "Account recovery controls", "Remote device sign-out", "Data-retention rules", "Owner, admin, manager, employee, accountant, and contractor roles"],
    templates: [
      { name: "Access review", description: "Quarterly review of roles, dormant accounts, and exceptions." },
      { name: "Device inventory", description: "Owner, serial, protection status, and last check-in." },
      { name: "Incident response", description: "Containment, communication, recovery, and lessons learned." },
    ],
    views: ["Security score", "Access", "Devices", "Audit log"],
  },
  {
    slug: "automations-ai",
    name: "AI & automations",
    eyebrow: "Less repetitive work",
    description: "Prepare documents, extract information, route work, and automate repeatable administration safely.",
    icon: "automation",
    group: "Manage & protect",
    accent: "purple",
    features: ["Rewrite and proofread documents", "Summarize files and email threads", "Meeting notes and action items", "Draft replies and proposals", "Compare document versions", "Receipt and invoice extraction", "Answers grounded in company documents", "Document translation", "Notes-to-tasks conversion", "Business report generation", "Missing-field and inconsistency detection", "Trigger, condition, approval, and action workflows", "Confirmation for payments, deletion, contracts, and external messages"],
    templates: [
      { name: "Receipt to expense", description: "Extract, categorize, check duplicates, and request approval." },
      { name: "Meeting to actions", description: "Summarize, assign tasks, and schedule follow-ups." },
      { name: "Overdue invoice follow-up", description: "Draft a reminder and require approval before sending." },
    ],
    views: ["Assistant", "Automations", "Runs", "Approvals"],
  },
  {
    slug: "utilities",
    name: "Everyday utilities",
    eyebrow: "Small tools, close at hand",
    description: "Keep the high-frequency business utilities people reach for every day in one drawer.",
    icon: "utilities",
    group: "Manage & protect",
    accent: "zinc",
    features: ["Calculator and percentage calculator", "Unit, currency, and time-zone converter", "Screenshot and screen recording", "Clipboard history", "QR-code generator and barcode scanner", "Image resizing, compression, and background removal", "Label, envelope, business-card, and mailing-label printing", "ZIP creation", "Voice recording and transcription", "Mileage tracker", "Contact importer", "Duplicate-file finder", "Bulk file renamer"],
    templates: [
      { name: "Print labels", description: "Create product, address, or mailing labels from a list." },
      { name: "Create QR code", description: "Generate a branded QR code for a URL or contact." },
      { name: "Convert and compress", description: "Resize images or package selected files for sharing." },
    ],
    views: ["Favorites", "Files", "Converters", "Capture"],
  },
];

export function getOfficeSuiteModule(slug: string) {
  return OFFICE_SUITE_MODULES.find((module) => module.slug === slug);
}
export function officeModuleHref(module: OfficeSuiteModule) {
  return module.slug === "documents" ? "/office/documents" : `/office/apps/${module.slug}`;
}
