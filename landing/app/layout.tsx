import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import { PageLoader } from "./components/PageLoader";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CortexFlow AI — calling CRM that never clocks out",
  description:
    "CortexFlow AI calls every lead in under two minutes, qualifies conversations, books appointments, and keeps WhatsApp, email, and call history in one CRM.",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: "/favicon.png",
  },
  openGraph: {
    title: "CortexFlow AI — calling CRM that never clocks out",
    description:
      "AI calls your leads, qualifies them, and books the meeting — while your team stays focused on closing.",
    images: [{ url: "/logo.png", alt: "CortexFlow" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} ${instrument.variable} antialiased`}>
        <PageLoader />
        {children}
      </body>
    </html>
  );
}
