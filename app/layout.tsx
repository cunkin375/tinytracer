import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TinyTracer — WebGPU Path Tracer Sandbox",
  description:
    "A WYSIWYG scene configurator for a WebGPU-based path tracer. Position objects and orient the camera before the compute pass.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="h-screen w-screen overflow-hidden flex flex-col bg-[#0a0a0f]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
