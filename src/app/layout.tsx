import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Robot review",
  description: "Reviews and search analytics dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
