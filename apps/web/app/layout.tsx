import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AcctOS — Workflow Intelligence for Canadian Accounting Firms",
  description: "CRA deadlines native. 5-condition risk engine. Gate enforcement that prevents errors before they become penalties.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
