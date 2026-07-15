import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  SUBMITTED: "warning",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  NEEDS_MORE_INFO: "warning",
  REIMBURSED: "success",
  PAID: "success",
  ARCHIVED: "outline",
};

export function ExpenseStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
