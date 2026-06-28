"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidReceiptEmail } from "@/lib/register/receipt-email";

type OrderReceiptActionsProps = {
  orderId: string;
  defaultEmail?: string;
  emailedTo?: string | null;
  lastEmailedAt?: string | null;
  printed?: boolean;
  variant?: "default" | "compact" | "toolbar";
};

async function markReceiptPrinted(orderId: string) {
  await fetch(`/api/orders/${orderId}/receipt`, { method: "POST" });
}

async function printReceipt(orderId: string) {
  const previewUrl = `/orders/${orderId}/receipt?autoprint=1`;
  const printWindow = window.open(previewUrl, "_blank", "width=480,height=720");
  if (!printWindow) {
    const res = await fetch(`/api/orders/${orderId}/receipt?format=html`);
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "Failed to load receipt");
    }
    const html = await res.text();
    const fallback = window.open("", "_blank", "width=400,height=700");
    if (!fallback) {
      throw new Error("Pop-up blocked. Allow pop-ups to print receipts.");
    }
    fallback.document.write(html);
    fallback.document.close();
    fallback.focus();
    fallback.onload = () => fallback.print();
    await markReceiptPrinted(orderId);
    return;
  }
  await markReceiptPrinted(orderId);
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
  const [emailError, setEmailError] = useState<string>();

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
      toast.success("Receipt PDF downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  }

  async function handleSendEmail() {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError("Enter an email address.");
      return;
    }
    if (!isValidReceiptEmail(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(undefined);
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/receipt/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Failed to email receipt");
      }
      toast.success(`Receipt emailed to ${trimmed}`);
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
        onChange={(e) => {
          setEmail(e.target.value);
          setEmailError(undefined);
        }}
        placeholder="customer@example.com"
        aria-invalid={!!emailError}
        aria-describedby={emailError ? `receipt-email-error-${orderId}` : undefined}
      />
      {emailError && (
        <p id={`receipt-email-error-${orderId}`} className="text-sm text-red-600" role="alert">
          {emailError}
        </p>
      )}
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
          onClick={() => {
            setShowEmailForm(false);
            setEmailError(undefined);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  ) : null;

  if (variant === "toolbar") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-10"
          disabled={downloading}
          onClick={handleDownloadPdf}
        >
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          PDF
        </Button>
        <Button
          variant="outline"
          className="min-h-10"
          onClick={() => setShowEmailForm((v) => !v)}
        >
          <Mail className="mr-2 h-4 w-4" />
          Email
        </Button>
        {showEmailForm && (
          <div className="w-full basis-full">{emailForm}</div>
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="w-full">
        <div className="flex w-full flex-col gap-2">
          <Button
            className="min-h-11 w-full"
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
            className="min-h-11 w-full"
            variant="outline"
            onClick={() => setShowEmailForm((v) => !v)}
          >
            <Mail className="mr-2 h-4 w-4" />
            Email receipt
          </Button>
          <Button
            className="min-h-11 w-full"
            variant="outline"
            disabled={downloading}
            onClick={handleDownloadPdf}
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download PDF
          </Button>
          <Link href={`/orders/${orderId}/receipt`} className="w-full" target="_blank">
            <Button className="min-h-11 w-full" variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              Preview receipt
            </Button>
          </Link>
          <Link href={`/orders/${orderId}`} className="w-full">
            <Button className="min-h-11 w-full" variant="outline">
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
        <Button variant="outline" onClick={() => setShowEmailForm((v) => !v)}>
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
        <Link href={`/orders/${orderId}/receipt`} target="_blank">
          <Button variant="outline">
            <ExternalLink className="mr-2 h-4 w-4" />
            Preview
          </Button>
        </Link>
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
