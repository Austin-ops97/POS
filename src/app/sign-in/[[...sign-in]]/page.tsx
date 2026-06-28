import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    redirect("/register");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <SignIn fallbackRedirectUrl="/register" signUpUrl="/sign-up" />
    </div>
  );
}
