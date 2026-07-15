"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, PackagePlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarcodeScanner } from "@/components/barcode/barcode-scanner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { BarcodeLookupResponse } from "@/lib/barcode-lookup-types";

type LocationOption = { id: string; name: string };

type ScanMode =
  | "RECEIVE"
  | "CYCLE_COUNT"
  | "DAMAGED"
  | "LOST"
  | "FIND"
  | "ADD_NEW";

type SessionLine = {
  id: string;
  productId: string;
  inventoryItemId: string;
  normalizedCode: string;
  expectedQty: number;
  scannedQty: number;
  proposedDelta: number;
};

type ExternalSuggestion = Extract<
  BarcodeLookupResponse,
  { status: "EXTERNAL_MATCH" }
>["externalProduct"];

const MODE_LABELS: Record<ScanMode, string> = {
  RECEIVE: "Receive Stock",
  CYCLE_COUNT: "Cycle Count",
  DAMAGED: "Damaged",
  LOST: "Lost",
  FIND: "Find Product",
  ADD_NEW: "Add New Product",
};

export function InventoryScanClient({
  locations,
  defaultLocationId,
  canManageProducts,
}: {
  locations: LocationOption[];
  defaultLocationId?: string;
  canManageProducts: boolean;
}) {
  // Client inventory scan workflow (receive / count / damage / loss / find / add)
  const router = useRouter();
  const [locationId, setLocationId] = useState(
    defaultLocationId || locations[0]?.id || ""
  );
  const [mode, setMode] = useState<ScanMode | "">("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<SessionLine[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [foundProduct, setFoundProduct] = useState<{
    id: string;
    name: string;
    qty: number | null;
  } | null>(null);
  const [external, setExternal] = useState<ExternalSuggestion | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [conflictConfirmOpen, setConflictConfirmOpen] = useState(false);

  const isSessionMode =
    mode === "RECEIVE" ||
    mode === "CYCLE_COUNT" ||
    mode === "DAMAGED" ||
    mode === "LOST";

  const startSession = useCallback(async () => {
    if (!locationId || !isSessionMode || !mode) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/scan-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          mode,
          idempotencyKey: `scan-${mode}-${locationId}-${Date.now()}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to start scan session");
        return;
      }
      const session = await res.json();
      setSessionId(session.id);
      setLines(session.lines ?? []);
      setScannerOpen(true);
    } finally {
      setBusy(false);
    }
  }, [isSessionMode, locationId, mode]);

  const refreshSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/inventory/scan-sessions/${id}`);
    if (res.ok) {
      const session = await res.json();
      setLines(session.lines ?? []);
    }
  }, []);

  const lookupBarcode = useCallback(
    async (code: string, localOnly: boolean) => {
      const params = new URLSearchParams();
      if (locationId) params.set("locationId", locationId);
      if (localOnly) params.set("localOnly", "true");
      const res = await fetch(
        `/api/catalog/barcodes/${encodeURIComponent(code)}?${params}`
      );
      if (!res.ok) {
        toast.error("Barcode lookup failed");
        return null;
      }
      return (await res.json()) as BarcodeLookupResponse;
    },
    [locationId]
  );

  const onScan = useCallback(
    async (result: { rawValue: string }) => {
      const code = result.rawValue;
      setFoundProduct(null);
      setExternal(null);
      setUnknownCode(null);

      if (mode === "FIND") {
        const data = await lookupBarcode(code, true);
        if (data?.status === "LOCAL_MATCH") {
          setFoundProduct({
            id: data.product.id,
            name: data.product.name,
            qty: data.inventory?.quantityOnHand ?? null,
          });
          toast.success(data.product.name);
        } else {
          setUnknownCode(code);
          toast.error("Barcode not found in this business");
        }
        return;
      }

      if (mode === "ADD_NEW") {
        const data = await lookupBarcode(code, false);
        if (data?.status === "LOCAL_MATCH") {
          toast.message("Product already exists", {
            description: data.product.name,
            action: {
              label: "Open",
              onClick: () => router.push(`/products/${data.product.id}`),
            },
          });
          return;
        }
        if (data?.status === "EXTERNAL_MATCH") {
          setExternal(data.externalProduct);
          return;
        }
        setUnknownCode(code);
        return;
      }

      if (!sessionId || !isSessionMode) return;

      const res = await fetch(`/api/inventory/scan-sessions/${sessionId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: code, quantity: 1 }),
      });

      if (res.status === 404) {
        // Unknown in inventory session — offer add flow
        const data = await lookupBarcode(code, false);
        if (data?.status === "EXTERNAL_MATCH") {
          setExternal(data.externalProduct);
        } else {
          setUnknownCode(code);
        }
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Could not add scan");
        return;
      }

      await refreshSession(sessionId);
    },
    [isSessionMode, lookupBarcode, mode, refreshSession, router, sessionId]
  );

  const applySession = async (acceptConflicts = false) => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/inventory/scan-sessions/${sessionId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acceptConflicts,
            reason: reason || undefined,
            idempotencyKey: `apply-${sessionId}`,
          }),
        }
      );
      if (res.status === 409) {
        const data = await res.json();
        if (data.code === "CONFLICTS") {
          setConflictConfirmOpen(true);
          return;
        }
        toast.error(data.error ?? "Conflict applying session");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to apply session");
        return;
      }
      toast.success("Inventory updated");
      setSessionId(null);
      setLines([]);
      setScannerOpen(false);
      router.push("/inventory");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancelSession = async () => {
    if (!sessionId) return;
    await fetch(`/api/inventory/scan-sessions/${sessionId}`, {
      method: "DELETE",
    });
    setSessionId(null);
    setLines([]);
    setScannerOpen(false);
  };

  const updateLineQty = async (lineId: string, scannedQty: number) => {
    if (!sessionId) return;
    const res = await fetch(`/api/inventory/scan-sessions/${sessionId}/lines`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId, scannedQty }),
    });
    if (res.ok) await refreshSession(sessionId);
  };

  useEffect(() => {
    setSessionId(null);
    setLines([]);
    setFoundProduct(null);
    setExternal(null);
    setUnknownCode(null);
  }, [mode, locationId]);

  const buildNewProductHref = (barcode: string, suggestion?: ExternalSuggestion) => {
    const params = new URLSearchParams();
    params.set("barcode", barcode);
    if (suggestion?.name) params.set("name", suggestion.name);
    if (suggestion?.brand) params.set("brand", suggestion.brand);
    if (suggestion?.description) params.set("description", suggestion.description);
    if (suggestion?.imageUrl) params.set("imageUrl", suggestion.imageUrl);
    if (suggestion?.source) params.set("imageSource", suggestion.source);
    return `/products/new?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Scan Inventory</h1>
        <p className="text-sm text-slate-500">
          One-handed scanning for receive, count, damage, and loss.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Scan mode</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as ScanMode)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose mode" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABELS) as ScanMode[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {MODE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(mode === "DAMAGED" || mode === "LOST") && (
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional note"
              />
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!locationId || !mode || busy}
            onClick={() => {
              if (isSessionMode) void startSession();
              else setScannerOpen(true);
            }}
          >
            <Camera className="mr-2 h-5 w-5" />
            {isSessionMode ? "Start scanning" : "Open scanner"}
          </Button>
        </CardContent>
      </Card>

      {foundProduct && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" /> Product found
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium">{foundProduct.name}</p>
            {foundProduct.qty != null && (
              <p className="text-sm text-slate-500">
                On hand at location: {foundProduct.qty}
              </p>
            )}
            <Button asChild variant="outline">
              <Link href={`/products/${foundProduct.id}`}>Open product</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {external && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Product found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {external.imageUrl && (
              // External catalog image — attribution required; not owned by NexaPOS
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={external.imageUrl}
                alt={external.name ?? "Product"}
                className="mx-auto h-32 w-32 rounded object-contain"
              />
            )}
            <div>
              <p className="font-medium">{external.name}</p>
              <p className="text-sm text-slate-500">
                {[external.brand, external.packageSize].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400">
                {external.normalizedBarcode}
              </p>
              <p className="text-xs text-slate-400">
                Source: {external.source} · Confidence: {external.confidence}
              </p>
              {external.imageAttribution && (
                <p className="text-xs text-slate-400">{external.imageAttribution}</p>
              )}
            </div>
            <div className="grid gap-2">
              {canManageProducts && (
                <>
                  <Button asChild>
                    <Link href={buildNewProductHref(external.normalizedBarcode, external)}>
                      Use This Product
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={buildNewProductHref(external.normalizedBarcode, external)}>
                      Edit Before Adding
                    </Link>
                  </Button>
                </>
              )}
              <Button variant="ghost" onClick={() => setExternal(null)}>
                Not the Correct Product
              </Button>
              {canManageProducts && (
                <Button asChild variant="secondary">
                  <Link href={buildNewProductHref(external.normalizedBarcode)}>
                    <PackagePlus className="mr-2 h-4 w-4" />
                    Enter Product Manually
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {unknownCode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">We could not identify this barcode.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-mono text-sm">{unknownCode}</p>
            {canManageProducts && (
              <Button asChild>
                <Link href={buildNewProductHref(unknownCode)}>
                  Create product manually
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => setScannerOpen(true)}>
              Retake scan
            </Button>
            <Button variant="ghost" onClick={() => setUnknownCode(null)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {sessionId && lines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review ({lines.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-slate-500">
                    {line.normalizedCode}
                  </p>
                  <p className="text-sm">
                    Expected {line.expectedQty} · Δ {line.proposedDelta}
                  </p>
                </div>
                <Input
                  className="w-24"
                  type="text"
                  inputMode="numeric"
                  min={0}
                  value={line.scannedQty}
                  aria-label={`Scanned quantity for ${line.normalizedCode}`}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setLines((prev) =>
                      prev.map((l) =>
                        l.id === line.id ? { ...l, scannedQty: v } : l
                      )
                    );
                  }}
                  onBlur={() => void updateLineQty(line.id, line.scannedQty)}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() => void applySession(false)}
              >
                Apply changes
              </Button>
              <Button variant="outline" onClick={() => void cancelSession()}>
                Cancel
              </Button>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setScannerOpen(true)}
            >
              Continue scanning
            </Button>
          </CardContent>
        </Card>
      )}

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(r) => void onScan(r)}
        continuous={isSessionMode || mode === "FIND"}
        title={mode ? MODE_LABELS[mode] : "Scan barcode"}
      />

      <ConfirmDialog
        open={conflictConfirmOpen}
        onOpenChange={setConflictConfirmOpen}
        title="Stock changed"
        description="Stock changed since scanning began. Apply using current quantities?"
        confirmLabel="Apply anyway"
        loading={busy}
        onConfirm={async () => {
          setConflictConfirmOpen(false);
          await applySession(true);
        }}
      />
    </div>
  );
}
