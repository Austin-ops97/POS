import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  ClipboardList,
  Users,
  UserCog,
  BarChart3,
  Settings,
  CreditCard,
  CalendarClock,
  Wallet,
  Receipt,
  PiggyBank,
  LineChart,
  Files,
  FileText,
  FolderKanban,
  FileSignature,
  Bot,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavSection = {
  id: string;
  label?: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/register", label: "Register", icon: ShoppingCart },
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/products", label: "Products", icon: Package },
      { href: "/inventory", label: "Inventory", icon: Warehouse },
      { href: "/orders", label: "Orders", icon: ClipboardList },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/employees", label: "Employees", icon: UserCog },
      { href: "/workforce", label: "Workforce", icon: CalendarClock },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    id: "office",
    label: "Office",
    items: [
      { href: "/office", label: "Office hub", icon: Files },
      { href: "/office/documents", label: "Documents", icon: FileText },
      { href: "/office/apps/projects", label: "Projects", icon: FolderKanban },
      { href: "/office/apps/forms-approvals", label: "Forms & approvals", icon: FileSignature },
      { href: "/office/apps/automations-ai", label: "AI & automations", icon: Bot },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { href: "/finance/expenses", label: "Expenses", icon: Wallet },
      { href: "/finance/cards", label: "Company Cards", icon: CreditCard },
      { href: "/finance/reimbursements", label: "Reimbursements", icon: Receipt },
      { href: "/finance/reports", label: "Expense Reports", icon: LineChart },
      { href: "/finance/budgets", label: "Budgets", icon: PiggyBank },
    ],
  },
  {
    id: "settings",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

/** Flat list kept for compatibility with any existing imports. */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export function isNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  if (href === "/office") return false;
  if (href === "/finance/expenses") {
    return (
      pathname === "/finance/expenses" ||
      pathname.startsWith("/finance/expenses/")
    );
  }
  if (href === "/finance/reports") {
    return pathname === "/finance/reports" || pathname.startsWith("/finance/reports/");
  }
  return pathname.startsWith(href);
}

export type NavVisibility = {
  /** When false, hide the Finance section entirely. */
  expensesEnabled: boolean;
  /** When false, hide Workforce until the business has multiple staff. */
  showWorkforce: boolean;
  /** When false, hide the Office workspace. */
  officeEnabled: boolean;
};

export function filterNavSections(
  sections: NavSection[],
  visibility: NavVisibility
): NavSection[] {
  return sections
    .map((section) => {
      if (section.id === "finance" && !visibility.expensesEnabled) {
        return null;
      }
      if (section.id === "office" && !visibility.officeEnabled) {
        return null;
      }
      if (section.id === "main") {
        return {
          ...section,
          items: section.items.filter((item) => {
            if (item.href === "/workforce" && !visibility.showWorkforce) {
              return false;
            }
            return true;
          }),
        };
      }
      return section;
    })
    .filter((section): section is NavSection => section != null);
}
