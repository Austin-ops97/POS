import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Puzzle } from "lucide-react";

export default function IntegrationsSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Settings
        </Button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="text-sm text-slate-500">Connect third-party services</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-slate-400" />
            Coming soon
          </CardTitle>
          <CardDescription>
            Accounting, e-commerce, and marketing integrations will be available in a future
            release. Stripe Connect is your primary payment integration today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings/payments">
            <Button variant="outline">Go to Payments</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
