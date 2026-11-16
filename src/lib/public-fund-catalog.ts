import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { PUBLIC_DIRECTORY_TAG } from "./cache-tags";
import { maskPhones } from "./domain";

// Metadata only: opening the catalog never scans receipts or computes ledger totals.
export const publicFundCatalog = unstable_cache(async () => {
  const funds = await db.fund.findMany({
    where: { publicListed: true },
    select: { code: true, name: true, slug: true, status: true,
      recognitionEnabled: true, recognitionTitle: true, recognitionAmount: true },
  });
  return funds.sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true }))
    .map(fund => ({ code: fund.code, name: maskPhones(fund.name), slug: fund.slug, status: fund.status,
      recognitionTitle: fund.recognitionEnabled && fund.recognitionAmount !== null && fund.recognitionAmount > 0n
        ? maskPhones(fund.recognitionTitle || "Cổ phần") : null }));
}, ["public-fund-catalog-v1"], { revalidate: false, tags: [PUBLIC_DIRECTORY_TAG] });

export type PublicFundCatalog = Awaited<ReturnType<typeof publicFundCatalog>>;
