import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulseChat",
  description:
    "Real-time chat demo — live messages, typing indicators, online users and persistent history.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#eef1ef] text-[#1c2521] antialiased">{children}</body>
    </html>
  );
}
