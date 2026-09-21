import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "@/components/settings/import-wizard";
import { canOpenImport } from "@/lib/import/access";

export const metadata = { title: "Data Import" };

export default async function DataImportPage() {
  const ctx = await requireAuth();
  if (!canOpenImport(ctx)) redirect("/settings");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Settings
        </Button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Data Import</h1>
        <p className="text-sm text-slate-500">Bring customers, vendors, products, and expenses into the records EmeraldOne already uses.</p>
      </div>
      <ImportWizard />
    </div>
  );
}
