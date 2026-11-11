import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KetemuTerus Motion Studio",
  description: "Remote MCP video production studio powered by Gemini Omni Flash."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}