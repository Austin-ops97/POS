"use client";
/* eslint-disable @next/next/no-img-element -- QR bytes come from an authenticated route */

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ContactCard({ employeeId, name }: { employeeId: string; name: string }) {
  const image = `/api/employees/${employeeId}/contact-card?format=png`;
  const file = `/api/employees/${employeeId}/contact-card`;
  return (
    <div className="space-y-3">
      <img src={image} alt={`Contact QR code for ${name}`} className="h-40 w-40 rounded-xl border border-slate-200 bg-white" />
      <p className="text-xs text-slate-500">Work name, title, phone, and email only. Pay and personal dates are not in this code.</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={file} download>
            <Download className="h-4 w-4" />
            Download vCard
          </a>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>
    </div>
  );
}
