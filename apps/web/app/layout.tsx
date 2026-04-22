import type { Metadata } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIJobs",
  description: "Precision-first AI job platform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}

