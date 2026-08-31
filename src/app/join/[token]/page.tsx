import { db } from "@/lib/db";
import { getAuthUser, isClerkConfigured } from "@/lib/auth";
import { hashInvitationToken } from "@/lib/employee-invitations";
import { AcceptInvitation } from "@/components/auth/accept-invitation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmeraldWordmark } from "@/components/brand/emerald-mark";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [user, employee] = await Promise.all([
    getAuthUser(),
    db.employeeProfile.findUnique({
      where: { inviteTokenHash: hashInvitationToken(token) },
      include: { business: { select: { name: true, status: true } } },
    }),
  ]);

  const preview =
    !employee ||
    employee.deletedAt != null ||
    employee.business.status !== "ACTIVE" ||
    !employee.inviteExpiresAt ||
    employee.inviteExpiresAt < new Date()
      ? {
          valid: false,
          expired: true,
          email: employee?.email,
          businessName: employee?.business.name,
        }
      : {
          valid: true,
          expired: false,
          email: employee.email,
          businessName: employee.business.name,
          status: employee.status,
          alreadyJoined: Boolean(employee.userId && employee.status === "ACTIVE"),
        };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <EmeraldWordmark size="md" />
          <CardTitle>Join your business workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AcceptInvitation
            token={token}
            preview={preview}
            signedInEmail={user?.email ?? null}
            authEnabled={isClerkConfigured()}
          />
        </CardContent>
      </Card>
    </main>
  );
}
