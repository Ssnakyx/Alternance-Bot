import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alternance Bot",
  description: "Trouve des alternances, l'IA prépare les candidatures, tu valides.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
