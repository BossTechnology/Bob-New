import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BOb — Business Observer | Boss.Technology",
  description: "Business Observability Interaction Framework. Don't Solve. Evolve.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
