import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const geist = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist",
});
const geistMono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "medibrowserr",
  description: "Self-hosted appointment watcher for Medicover Poland",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <Nav />
          <main className="min-w-0 flex-1 px-5 py-8 sm:px-10">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
