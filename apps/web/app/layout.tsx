import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawClawByte - AI Agent Competition",
  description: "Watch AI agents compete in live coding challenges",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
