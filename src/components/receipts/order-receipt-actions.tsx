"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidReceiptEmail } from "@/lib/register/receipt-email";
import { useFormatDate } from "@/components/providers/timezone-provider";
import {
  filenameFromContentDisposition,
  receiptPdfFilename,
} from "@/lib/receipts/receipt-filename";

type OrderReceiptActionsProps = {
  orderId: string;
  orderNumber?: string;
  defaultEmail?: string;
  emailedTo?: string | null;
  lastEmailedAt?: string | null;
  printed?: boolean;
  variant?: "default" | "compact" | "toolbar";
};

function actionError(error: unknown, fallback: string) {
  if (error instanceof TypeError) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

async function deliverPdfFile(blob: Blob, filename: string): Promise<"saved" | "cancelled"> {
  const file = new File([blob], filename, { type: "application/pdf" });
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  if (
    coarsePointer &&
    typeof navigator.share === "function" &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (coarsePointer) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.assign(url);
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "saved";
}

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
  orderNumber,
  defaultEmail,
  emailedTo,
  lastEmailedAt,
  printed,
  variant = "default",
}: OrderReceiptActionsProps) {
  const formatDate = useFormatDate();
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [sentTo, setSentTo] = useState(emailedTo);
  const [sentAt, setSentAt] = useState(lastEmailedAt);
  const sendingRef = useRef(false);

  function openEmailDialog() {
    setEmail(defaultEmail ?? "");
    setEmailError(undefined);
    setEmailOpen(true);
  }

  async function handlePrint() {
    setPrinting(true);
    try {
      await printReceipt(orderId);
      toast.success("Receipt sent to printer");
    } catch (err) {
      toast.error(actionError(err, "Failed to print receipt"));
    } finally {
      setPrinting(false);
    }
  }

  async function handleDownloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/receipt/pdf`);
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "The receipt PDF could not be downloaded. Try again.");
      }
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("application/pdf")) {
        throw new Error("The server did not return a PDF receipt.");
      }
      const filename = filenameFromContentDisposition(
        res.headers.get("Content-Disposition"),
        orderNumber ? receiptPdfFilename(orderNumber) : "Receipt.pdf"
      );
      const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
      const delivered = await deliverPdfFile(blob, filename);
      if (delivered === "cancelled") return;
      toast.success("Receipt PDF downloaded");
    } catch (err) {
      toast.error(actionError(err, "The receipt PDF could not be downloaded. Try again."));
    } finally {
      setDownloading(false);
    }
  }

  async function handleSendEmail(event?: FormEvent) {
    event?.preventDefault();
    if (sendingRef.current) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError(defaultEmail ? "Enter an email address." : "Enter an email address to send this receipt.");
      return;
    }
    if (!isValidReceiptEmail(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    sendingRef.current = true;
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
        throw new Error(err?.error ?? "The receipt could not be emailed. Try again.");
      }
      toast.success(`Receipt emailed to ${trimmed}`);
      setSentTo(trimmed);
      setSentAt(new Date().toISOString());
      setEmailOpen(false);
    } catch (err) {
      const message = actionError(err, "The receipt could not be emailed. Try again.");
      setEmailError(message);
      toast.error(message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const emailDialog = (
    <Dialog
      open={emailOpen}
      onOpenChange={(open) => {
        if (sending) return;
        setEmailOpen(open);
        if (!open) setEmailError(undefined);
      }}
    >
      <DialogContent>
        <form onSubmit={(event) => void handleSendEmail(event)}>
          <DialogHeader>
            <DialogTitle>Email receipt</DialogTitle>
            <DialogDescription>
              {defaultEmail
                ? "The customer's email is filled in. You can change it before sending the receipt PDF."
                : "This order has no customer email. Enter the address that should receive the receipt PDF."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`receipt-email-${orderId}`}>Email address</Label>
            <Input
              id={`receipt-email-${orderId}`}
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(undefined);
              }}
              placeholder="customer@example.com"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? `receipt-email-error-${orderId}` : undefined}
              disabled={sending}
            />
            {emailError ? (
              <p id={`receipt-email-error-${orderId}`} className="text-sm text-red-600" role="alert">
                {emailError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={sending}
              onClick={() => {
                setEmailOpen(false);
                setEmailError(undefined);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send receipt"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  const printButton = (
    <Button
      variant="outline"
      className={variant === "compact" ? "min-h-11 w-full" : variant === "toolbar" ? "min-h-10" : undefined}
      disabled={printing}
      onClick={handlePrint}
    >
      {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
      Print
    </Button>
  );

  const previewButton = (
    <Link href={`/orders/${orderId}/receipt`} className={variant === "compact" ? "w-full" : undefined} target="_blank">
      <Button variant="outline" className={variant === "compact" ? "min-h-11 w-full" : variant === "toolbar" ? "min-h-10" : undefined}>
        <ExternalLink className="mr-2 h-4 w-4" />
        Preview
      </Button>
    </Link>
  );

  const downloadButton = (
    <Button
      variant="outline"
      className={variant === "compact" ? "min-h-11 w-full" : variant === "toolbar" ? "min-h-10" : undefined}
      disabled={downloading}
      onClick={handleDownloadPdf}
    >
      {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      Download
    </Button>
  );

  const emailButton = (
    <Button
      variant="outline"
      className={variant === "compact" ? "min-h-11 w-full" : variant === "toolbar" ? "min-h-10" : undefined}
      onClick={openEmailDialog}
    >
      <Mail className="mr-2 h-4 w-4" />
      Email receipt
    </Button>
  );

  if (variant === "toolbar") {
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {downloadButton}
          {emailButton}
        </div>
        {emailDialog}
      </>
    );
  }

  if (variant === "compact") {
    return (
      <div className="w-full">
        <div className="flex w-full flex-col gap-2">
          {printButton}
          {previewButton}
          {downloadButton}
          {emailButton}
          <Link href={`/orders/${orderId}`} className="w-full">
            <Button className="min-h-11 w-full" variant="outline">
              View order
            </Button>
          </Link>
        </div>
        {emailDialog}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {printButton}
        {previewButton}
        {downloadButton}
        {emailButton}
      </div>
      {emailDialog}
      {(sentTo || printed || sentAt) && (
        <div className="text-sm text-slate-500">
          {sentTo ? (
            <p>
              Emailed to {sentTo}
              {sentAt ? ` · ${formatDate(sentAt)}` : ""}
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
