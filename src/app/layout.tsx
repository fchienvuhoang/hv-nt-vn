import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Hùn phước · Minh bạch thiện pháp", template: "%s · Hùn phước" }, description: "Theo dõi hùn phước, thu chi và điều chuyển của các thiện pháp." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
