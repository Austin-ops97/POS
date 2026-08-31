import type { Metadata, Viewport } from "next";
import { Outfit, Fraunces } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { isClerkConfigured } from "@/lib/clerk-config";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-sans-face",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "EmeraldPOS",
    template: "%s · EmeraldPOS",
  },
  description:
    "Point of sale, inventory, payments, customers, employees, and reports.",
  applicationName: "EmeraldPOS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EmeraldPOS",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#f8fafc" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </>
  );
  const clerkEnabled = isClerkConfigured();
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html
      lang="en"
      className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full min-h-dvh">
        {clerkEnabled && publishableKey ? (
          <ClerkProvider publishableKey={publishableKey}>{content}</ClerkProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
