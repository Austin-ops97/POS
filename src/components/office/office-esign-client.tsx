"use client";

import { FormEvent, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type RequestRow = {
  id: string;
  title: string;
  kind: string;
  signerName: string;
  signerEmail: string;
  status: string;
  sentAt: string;
  viewedAt: string | null;
  signedAt: string | null;
  contentSha256: string | null;
  signerIp: string | null;
  signerUserAgent: string | null;
};

export function OfficeEsignClient({
  initial,
  documents,
  customers,
  canCreate,
}: {
  initial: RequestRow[];
  documents: Array<{ id: string; title: string }>;
  customers: Array<{ id: string; name: string; email: string | null }>;
  canCreate: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [lastLink, setLastLink] = useState<{ url: string; emailed: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/office/esign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          kind: form.get("kind"),
          body: form.get("body"),
          documentId: documentId || null,
          customerId: customerId || null,
          signerName: form.get("signerName"),
          signerEmail: form.get("signerEmail"),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not send for signature");
      setRows((items) => [body, ...items]);
      const signUrl = typeof body.signUrl === "string" ? body.signUrl : "";
      const emailed = body.emailSent === true;
      setLastLink(signUrl ? { url: signUrl, emailed } : null);
      if (emailed) {
        toast.success("Signature request emailed");
      } else {
        toast.success("Email was not sent. Copy the signing link to share it.", {
          duration: 12_000,
        });
      }
      event.currentTarget.reset();
      setCustomerId("");
      setDocumentId("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  function pickCustomer(id: string) {
    setCustomerId(id);
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold">E-signature</h1>
        <p className="text-sm text-slate-500">Send a quote, contract, or work authorization. Customers sign on a private link.</p>
      </div>
      {canCreate ? (
        <form onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Title
              <Input name="title" required className="mt-1" />
            </label>
            <label className="text-sm font-medium">
              Type
              <select name="kind" defaultValue="CONTRACT" className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm">
                <option value="QUOTE">Quote</option>
                <option value="CONTRACT">Contract</option>
                <option value="WORK_AUTHORIZATION">Work authorization</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
          </div>
          <label className="text-sm font-medium">
            Attach existing document
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
            >
              <option value="">Create from text below</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Document text
            <Textarea name="body" className="mt-1" rows={6} placeholder="Paste or write the agreement" />
          </label>
          <label className="text-sm font-medium">
            Customer (optional)
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
              value={customerId}
              onChange={(e) => {
                const customer = customers.find((item) => item.id === e.target.value);
                pickCustomer(e.target.value);
                if (customer) {
                  const form = e.currentTarget.form;
                  if (form) {
                    (form.elements.namedItem("signerName") as HTMLInputElement).value = customer.name;
                    if (customer.email) (form.elements.namedItem("signerEmail") as HTMLInputElement).value = customer.email;
                  }
                }
              }}
            >
              <option value="">Not in directory</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Signer name
              <Input name="signerName" required className="mt-1" />
            </label>
            <label className="text-sm font-medium">
              Signer email
              <Input name="signerEmail" type="email" required className="mt-1" />
            </label>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send for signature"}
          </Button>
        </form>
      ) : null}
      {lastLink ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-all text-slate-700">
            {lastLink.emailed ? "Signing link (also emailed): " : "No email was sent. Signing link: "}
            <a className="font-medium text-indigo-700 underline" href={lastLink.url}>
              {lastLink.url}
            </a>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              void navigator.clipboard.writeText(lastLink.url).then(
                () => toast.success("Signing link copied"),
                () => toast.error("Could not copy the link")
              );
            }}
          >
            <Copy className="h-4 w-4" />
            Copy link
          </Button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Signer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Audit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-medium">{row.title}</p>
                  <p className="text-xs text-slate-500">{row.kind.replaceAll("_", " ")}</p>
                </td>
                <td className="px-4 py-3">
                  {row.signerName}
                  <p className="text-xs text-slate-500">{row.signerEmail}</p>
                </td>
                <td className="px-4 py-3 capitalize">{row.status.toLowerCase()}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <p>Sent {new Date(row.sentAt).toLocaleString()}</p>
                  {row.viewedAt ? <p>Viewed {new Date(row.viewedAt).toLocaleString()}</p> : null}
                  {row.signedAt ? <p>Signed {new Date(row.signedAt).toLocaleString()}</p> : null}
                  {row.signerIp ? <p>IP {row.signerIp}</p> : null}
                  {row.contentSha256 ? <p className="break-all">SHA-256 {row.contentSha256}</p> : null}
                  {row.status === "SIGNED" ? (
                    <a className="mt-1 inline-block font-medium text-indigo-700 underline" href={`/api/office/esign/${row.id}/pdf`}>
                      Download signed PDF
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No signature requests yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
