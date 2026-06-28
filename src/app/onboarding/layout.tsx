import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isDemoMode } from "@/lib/demo-mode";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isDemoMode()) {
    redirect("/dashboard");
  }

  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/onboarding");
  }

  return children;
}
