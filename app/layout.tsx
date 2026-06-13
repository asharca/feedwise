import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { DevUserSwitcher } from "@/components/dev/dev-user-switcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feedwise",
  description: "Self-hosted RSS reader",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="bottom-right" />
          {process.env.NODE_ENV !== "production" && <DevUserSwitcher />}
        </ThemeProvider>
      </body>
    </html>
  );
}
