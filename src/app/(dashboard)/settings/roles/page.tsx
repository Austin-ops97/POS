import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";

export default async function RolesSettingsPage() {
  const ctx = await requireAuth();

  const roles = await db.role.findMany({
    where: { isSystem: true },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { employees: true } },
    },
    orderBy: { name: "asc" },
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
        <h1 className="text-2xl font-bold text-slate-900">Roles & Permissions</h1>
        <p className="text-sm text-slate-500">
          System roles for {ctx.business.name}
        </p>
      </div>
      <div className="grid gap-4">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <CardTitle className="text-base">{role.name}</CardTitle>
              <CardDescription>
                {role._count.employees} team member
                {role._count.employees !== 1 ? "s" : ""} ·{" "}
                {role.permissions.length} permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2">
                {role.permissions.map((rp) => (
                  <li
                    key={rp.permissionId}
                    className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600"
                  >
                    {rp.permission.name}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
