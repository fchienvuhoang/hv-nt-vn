import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/toasts";
import { SiteAnalytics } from "@/components/site-analytics";
export const metadata: Metadata = {
  title: {
    default: "Học viện nguyên thủy Việt Nam",
    template: "%s · Học viện nguyên thủy Việt Nam",
  },
  description:
    "Theo dõi hùn phước, thu chi và điều chuyển thiện pháp của Học Viện Nguyên Thủy Việt Nam.",
  icons: {
    icon: {
      url: "/branding/hoc-vien-nguyen-thuy-viet-nam.png",
      type: "image/png",
    },
    apple: "/branding/hoc-vien-nguyen-thuy-viet-nam.png",
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
