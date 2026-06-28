import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/lib/auth";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isClerkConfigured()) {
    return children;
  }

  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/onboarding");
  }

  return children;
}
