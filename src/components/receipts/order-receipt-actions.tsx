"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Loader2, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OrderReceiptActionsProps = {
  orderId: string;
  defaultEmail?: string;
  emailedTo?: string | null;
  lastEmailedAt?: string | null;
  printed?: boolean;
  variant?: "default" | "compact";
};

async function printReceipt(orderId: string) {
  const res = await fetch(`/api/orders/${orderId}/receipt?format=html`);
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? "Failed to load receipt");
  }
  const html = await res.text();
  const printWindow = window.open("", "_blank", "width=400,height=700");
  if (!printWindow) {
    throw new Error("Pop-up blocked. Allow pop-ups to print receipts.");
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
  await fetch(`/api/orders/${orderId}/receipt`, { method: "POST" });
}

export function OrderReceiptActions({
  orderId,
  defaultEmail,
  emailedTo,
  lastEmailedAt,
  printed,
  variant = "default",
}: OrderReceiptActionsProps) {
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sending, setSending] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    try {
      await printReceipt(orderId);
      toast.success("Receipt sent to printer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to print receipt");
    } finally {
      setPrinting(false);
    }
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/receipt/pdf`);
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to download PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${orderId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  }

  async function handleSendEmail() {
    if (!email.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/receipt/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to email receipt");
      }
      toast.success(`Receipt emailed to ${email.trim()}`);
      setShowEmailForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to email receipt");
    } finally {
      setSending(false);
    }
  }

  const emailForm = showEmailForm ? (
    <div className="mt-3 w-full space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
      <Label htmlFor={`receipt-email-${orderId}`}>Email address</Label>
      <Input
        id={`receipt-email-${orderId}`}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="customer@example.com"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={sending} onClick={handleSendEmail}>
          {sending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send receipt"
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowEmailForm(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  ) : null;

  if (variant === "compact") {
    return (
      <div className="w-full">
        <div className="flex w-full flex-col gap-2">
          <Button
            className="w-full"
            variant="outline"
            disabled={printing}
            onClick={handlePrint}
          >
            {printing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Print receipt
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setShowEmailForm((v) => !v)}
          >
            <Mail className="mr-2 h-4 w-4" />
            Email receipt
          </Button>
          <Link href={`/orders/${orderId}`} className="w-full">
            <Button className="w-full" variant="outline">
              View order
            </Button>
          </Link>
        </div>
        {emailForm}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={printing} onClick={handlePrint}>
          {printing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Printer className="mr-2 h-4 w-4" />
          )}
          Print Receipt
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowEmailForm((v) => !v)}
        >
          <Mail className="mr-2 h-4 w-4" />
          Email Receipt
        </Button>
        <Button variant="outline" disabled={downloading} onClick={handleDownloadPdf}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download PDF
        </Button>
      </div>

      {emailForm}

      {(emailedTo || printed || lastEmailedAt) && (
        <div className="text-sm text-slate-500">
          {emailedTo ? (
            <p>
              Emailed to {emailedTo}
              {lastEmailedAt
                ? ` · ${new Date(lastEmailedAt).toLocaleString()}`
                : ""}
            </p>
          ) : (
            <p>Not emailed</p>
          )}
          {printed && <p>Printed</p>}
        </div>
      )}
    </div>
  );
}

export { printReceipt };
