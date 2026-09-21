import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, CreditCard, Landmark, Puzzle, Share2 } from "lucide-react";

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
        <p className="text-sm text-slate-500">Connected services for payments and beyond</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-slate-400" aria-hidden="true" />
            Stripe Connect
          </CardTitle>
          <CardDescription>
            Card payments, Terminal readers, and payouts. This is the primary integration
            available today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/settings/payments">Manage payments</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-slate-400" aria-hidden="true" />
            Banking
          </CardTitle>
          <CardDescription>
            Plaid Link for checking, savings, and credit accounts. The page stays not connected until a bank finishes linking. EmeraldOne does not collect bank passwords.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/settings/integrations/banking">Banking settings</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-slate-400" aria-hidden="true" />
            Social media
          </CardTitle>
          <CardDescription>
            Official Facebook, Instagram, and LinkedIn OAuth. The page stays not connected until each platform finishes authorization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/settings/integrations/social">Social media settings</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-slate-400" aria-hidden="true" />
            QuickBooks
          </CardTitle>
          <CardDescription>
            Official Intuit connection for a one-way pull of customers, vendors, products, and expenses.
            The page stays disconnected until OAuth completes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/settings/integrations/quickbooks">QuickBooks settings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}