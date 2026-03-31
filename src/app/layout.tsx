import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { UserProvider } from "@/lib/context/UserContext";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GREENROOM",
  description: "Premium Music Samples for Your Sound",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <UserProvider>
          {children}
          <Toaster theme="dark" position="bottom-right" richColors />
        </UserProvider>
        <Analytics />
      </body>
    </html>
  );
}
