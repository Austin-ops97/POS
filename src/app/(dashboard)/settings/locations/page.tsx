import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";

export default async function LocationsSettingsPage() {
  const ctx = await requireAuth();
  const locations = await db.location.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Settings
          </Button>
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Locations</h1>
        <p className="text-sm text-slate-500">Manage store locations and addresses</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {locations.map((loc) => (
          <Card key={loc.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{loc.name}</CardTitle>
              {loc.isDefault && <Badge variant="secondary">Default</Badge>}
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              {[loc.street, loc.city, loc.state, loc.zip].filter(Boolean).join(", ") ||
                "No address set"}
              <p className="mt-2 text-xs text-slate-400">{loc.timezone}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {locations.length === 0 && (
        <p className="text-sm text-slate-500">No locations configured.</p>
      )}
    </div>
  );
}
