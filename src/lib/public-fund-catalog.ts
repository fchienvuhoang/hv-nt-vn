import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { PUBLIC_DIRECTORY_TAG } from "./cache-tags";
import { maskPhones } from "./domain";

// Metadata only: opening the catalog never scans receipts or computes ledger totals.
export const publicFundCatalog = unstable_cache(async () => {
  const funds = await db.fund.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { code: true, name: true, slug: true, status: true, isLongTerm: true,
      recognitionEnabled: true, recognitionTitle: true, recognitionAmount: true },
  });
  return funds
    .map(fund => ({ code: fund.code, name: maskPhones(fund.name), slug: fund.slug, status: fund.status, isLongTerm: fund.isLongTerm,
      recognitionTitle: fund.recognitionEnabled && fund.recognitionAmount !== null && fund.recognitionAmount > 0n
        ? maskPhones(fund.recognitionTitle || "Cổ phần") : null }));
}, ["public-fund-catalog-v4"], { revalidate: false, tags: [PUBLIC_DIRECTORY_TAG] });

export type PublicFundCatalog = Awaited<ReturnType<typeof publicFundCatalog>>;
