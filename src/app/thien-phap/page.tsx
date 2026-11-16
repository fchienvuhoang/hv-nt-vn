import type { Metadata } from "next";
import { PublicFundCatalogView } from "@/components/public-fund-catalog";

export const metadata: Metadata = { title: "Danh sách thiện pháp" };

export default function FundCatalogPage() {
  return <PublicFundCatalogView />;
}
