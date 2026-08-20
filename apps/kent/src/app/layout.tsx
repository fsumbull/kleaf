import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const spaceGrotesk = localFont({
  src: [
    { path: "../assets/fonts/SpaceGrotesk-Regular.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/SpaceGrotesk-Medium.ttf", weight: "500", style: "normal" },
    { path: "../assets/fonts/SpaceGrotesk-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-sg",
  display: "swap",
});

export const metadata: Metadata = {
  title: "kleaf panel — dijital karbon yönetimi",
  description:
    "KarbonKent Kurumsal — belediyeler için on-premise dijital karbon yönetim platformu. Sera gazı envanteri, iklim eylem planı ve azaltım senaryoları.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={spaceGrotesk.variable}>
      <body>{children}</body>
    </html>
  );
}
