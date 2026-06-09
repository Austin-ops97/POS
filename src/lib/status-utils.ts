import type { OrderStatus, EmployeeStatus, PaymentStatus, ReaderStatus, StripeAccountStatus } from "@prisma/client";
import type { BadgeProps } from "@/components/ui/badge";

export function getOrderStatusVariant(status: OrderStatus): BadgeProps["variant"] {
  switch (status) {
    case "PAID":
      return "success";
    case "PENDING_PAYMENT":
      return "warning";
    case "PARTIALLY_REFUNDED":
      return "warning";
    case "REFUNDED":
    case "CANCELED":
    case "FAILED":
      return "destructive";
    default:
      return "secondary";
  }
}

export function formatOrderStatus(status: OrderStatus): string {
  return status.replace(/_/g, " ");
}

export function getEmployeeStatusVariant(status: EmployeeStatus): BadgeProps["variant"] {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "INVITED":
      return "warning";
    default:
      return "secondary";
  }
}

export function getPaymentStatusVariant(status: PaymentStatus): BadgeProps["variant"] {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "PENDING":
    case "PROCESSING":
    case "REQUIRES_ACTION":
      return "warning";
    case "FAILED":
    case "CANCELED":
      return "destructive";
    default:
      return "secondary";
  }
}

export function getReaderStatusVariant(status: ReaderStatus): BadgeProps["variant"] {
  switch (status) {
    case "ONLINE":
      return "success";
    case "BUSY":
      return "warning";
    default:
      return "secondary";
  }
}

export function getStripeStatusVariant(status: StripeAccountStatus): BadgeProps["variant"] {
  switch (status) {
    case "CONNECTED":
    case "READY":
      return "success";
    case "PENDING":
      return "warning";
    case "RESTRICTED":
      return "destructive";
    default:
      return "secondary";
  }
}
