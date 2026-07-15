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
