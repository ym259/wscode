import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Editor - AI-Powered Document IDE",
  description: "A VS Code-style document editor for lawyers and professionals. Edit, review, and collaborate on documents with AI assistance.",
  keywords: ["document editor", "docx editor", "word editor", "ai writing", "legal documents"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  );
}
