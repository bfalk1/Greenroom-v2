import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { UserProvider } from "@/lib/context/UserContext";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GREENROOM",
  description: "Premium Music Samples for Your Sound",
  manifest: "/manifest.json",
  themeColor: "#00FF88",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Greenroom",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
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
          <ServiceWorkerRegistration />
        </UserProvider>
      </body>
    </html>
  );
}
