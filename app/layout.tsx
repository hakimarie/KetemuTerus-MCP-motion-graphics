import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "KetemuTerus Motion Studio",
  description: "Generate short-form motion videos through Claude and MCP.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#0f172a", color: "#eff6ff" }}>
        {children}
      </body>
    </html>
  );
}