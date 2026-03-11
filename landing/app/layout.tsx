import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PageLoader } from "./components/PageLoader";
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
  title: "CortexFlow — AI Calling & Lead Management CRM",
  description:
    "Automate lead management with AI calling, WhatsApp, email, and call tracking. One dashboard for your entire sales pipeline.",
  openGraph: {
    title: "CortexFlow — AI Calling & Lead Management CRM",
    description:
      "Automate lead management with AI calling, WhatsApp, email, and call tracking.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PageLoader />
        {children}
      </body>
    </html>
  );
}
