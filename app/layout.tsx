import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassInbox — Classroom file submissions",
  description: "A simple QR-based classroom file submission inbox.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
