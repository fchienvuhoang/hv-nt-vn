import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toasts";
export const metadata: Metadata = {
  title: {
    default: "Hùn phước · Học Viện Nguyên Thủy Việt Nam",
    template: "%s · Hùn phước",
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
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
