import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { clashDisplay, satoshi, jetbrainsMono } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "TokenPilot - LLM Cost Optimization",
  description:
    "Real-time cost tracking and optimization for Anthropic Claude API usage. Monitor token consumption, analyze costs, and optimize your LLM applications.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${clashDisplay.variable} ${satoshi.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
