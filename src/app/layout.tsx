import {SITE_ORIGIN} from "@/lib/site-url";
import {pwaStartupImages} from "@/lib/pwa-splash";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/toasts";
import { SiteAnalytics } from "@/components/site-analytics";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#803345",
};
export const metadata: Metadata = {
  metadataBase:new URL(SITE_ORIGIN),
  title: {
    default: "Học viện nguyên thủy Việt Nam",
    template: "%s · Học viện nguyên thủy Việt Nam",
  },
  appleWebApp: {capable:true, title:"hvntvn", statusBarStyle:"default",startupImage:pwaStartupImages},
  description:
    "Theo dõi hùn phước, thu chi và điều chuyển thiện pháp của Học Viện Nguyên Thủy Việt Nam.",
  icons: {
    icon: {
      url: "/branding/hoc-vien-nguyen-thuy-viet-nam.png?v=2",
      type: "image/png",
    },
    apple: "/branding/hoc-vien-nguyen-thuy-viet-nam.png?v=2",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body><ToastProvider>{children}</ToastProvider><Suspense fallback={null}><SiteAnalytics /></Suspense></body>
    </html>
  );
}
