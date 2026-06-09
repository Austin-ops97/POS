import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { DemoBanner } from "@/components/demo-banner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NexaPOS — A cleaner, smarter POS for modern businesses",
  description:
    "Run checkout, inventory, employees, payments, refunds, reports, and customer management from one Stripe-powered platform.",
};

const isDemoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  !process.env.CLERK_SECRET_KEY;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <>
      {isDemoMode && <DemoBanner />}
      {children}
      <Toaster position="top-right" richColors />
    </>
  );

  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        {isDemoMode ? (
          content
        ) : (
          <ClerkProvider>{content}</ClerkProvider>
        )}
      </body>
    </html>
  );
}
