import { AcceptInvitation } from "@/components/auth/accept-invitation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join your business workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Accept this invitation to join the same business workspace as your team —
            including shared inventory, products, and orders. Sign in with the email
            address that received the invitation.
          </p>
          <AcceptInvitation token={token} />
        </CardContent>
      </Card>
    </main>
  );
}
