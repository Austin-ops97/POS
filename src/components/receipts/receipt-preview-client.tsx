"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderReceiptActions } from "@/components/receipts/order-receipt-actions";

type ReceiptPreviewClientProps = {
  orderId: string;
  orderNumber: string;
  receiptHtml: string;
  defaultEmail?: string;
  autoPrint?: boolean;
};

export function ReceiptPreviewClient({
  orderId,
  orderNumber,
  receiptHtml,
  defaultEmail,
  autoPrint,
}: ReceiptPreviewClientProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function printReceiptFrame() {
    const frame = iframeRef.current?.contentWindow;
    if (frame) {
      frame.focus();
      frame.print();
    } else {
      window.print();
    }
    void fetch(`/api/orders/${orderId}/receipt`, { method: "POST" });
  }

  useEffect(() => {
    if (!autoPrint) return;
    const timer = setTimeout(() => {
      const frame = iframeRef.current?.contentWindow;
      if (frame) {
        frame.focus();
        frame.print();
      } else {
        window.print();
      }
      void fetch(`/api/orders/${orderId}/receipt`, { method: "POST" });
    }, 400);
    return () => clearTimeout(timer);
  }, [autoPrint, orderId]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="print:hidden sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/orders/${orderId}`}>
              <Button variant="ghost" size="icon" aria-label="Back to order">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Receipt · {orderNumber}
              </h1>
              <p className="text-sm text-slate-500">Preview before printing</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-10"
              onClick={printReceiptFrame}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <OrderReceiptActions
              orderId={orderId}
              defaultEmail={defaultEmail}
              variant="toolbar"
            />
          </div>
        </div>
      </div>

      <div className="receipt-preview-shell mx-auto max-w-md px-4 py-8 print:max-w-none print:p-0">
        <iframe
          ref={iframeRef}
          title={`Receipt for order ${orderNumber}`}
          srcDoc={receiptHtml}
          className="h-[min(80vh,900px)] w-full rounded-lg border border-slate-200 bg-white shadow-sm print:h-auto print:border-0 print:shadow-none"
          sandbox="allow-same-origin"
        />
      </div>

    </div>
  );
}
