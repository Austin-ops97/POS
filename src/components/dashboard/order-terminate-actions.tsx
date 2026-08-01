"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TerminateOrderDialog } from "@/components/dashboard/terminate-order-dialog";

type OrderTerminateActionsProps = {
  order: {
    id: string;
    orderNumber: string;
    customerName: string | null;
    total: number;
    createdAt: string;
    employeeName?: string | null;
  };
};

export function OrderTerminateActions({ order }: OrderTerminateActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <TerminateOrderDialog
      order={order}
      open={open}
      onOpenChange={setOpen}
      showTrigger
      onTerminated={() => router.refresh()}
    />
  );
}
