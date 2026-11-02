import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import type { LedgerClient } from "./ledger";
import { ADMIN_LEDGER_TAG } from "./cache-tags";
import { PUBLIC_TAG } from "./public-data";
import { localDate, startOfVietnamDay } from "./domain";
import { encodeAdmin, decodeAdmin } from "./admin-codec";

export type ActivityFilter = { date: string; allTime: boolean; fundId: string; account: string };
type Group = { total: boolean; fundId: string | null; direction: string; assignment: string; count: bigint; amount: bigint };
const bucket = () => ({ count: 0, amount: 0n });
function summary() { return { income: bucket(), expense: bucket(), auto: bucket(), manual: bucket(), unassigned: bucket() }; }
function add(target: ReturnType<typeof summary>, row: Group) {
  const value = row.direction === "CREDIT" ? target.income : target.expense;
  value.count += Number(row.count); value.amount += row.amount;
  if (row.direction === "DEBIT") {
    const assigned = row.fundId !== null || row.total && row.assignment !== "UNASSIGNED";
    const group = !assigned ? target.unassigned : row.assignment === "AUTO" ? target.auto : target.manual;
    group.count += Number(row.count); group.amount += row.amount;
  }
}

/** Aggregate the whole selected scope, independently of transaction pagination. */
export async function fundActivity(filter: ActivityFilter, client: LedgerClient = db) {
  const start = startOfVietnamDay(filter.date), end = new Date(start.getTime() + 86400000);
  const [groups, funds] = await Promise.all([
    client.$queryRaw<Group[]>(Prisma.sql`
      WITH scoped AS (
        SELECT t.id, t."fundId", t.direction, t.assignment, t.amount
        FROM "BankTransaction" t
        WHERE t."entryStatus" = 'POSTED'
          ${filter.allTime ? Prisma.empty : Prisma.sql`AND t."occurredAt" >= ${start} AND t."occurredAt" < ${end}
            AND NOT EXISTS (SELECT 1 FROM "TransactionNote" n WHERE n."transactionId"=t.id AND n.kind='SOURCE_DATE_MISSING')`}
          ${filter.account ? Prisma.sql`AND t."accountId"=${filter.account}` : Prisma.empty}
      ), shares AS (
        SELECT t.id,t."fundId",t.direction,t.assignment,t.amount FROM scoped t
        WHERE NOT EXISTS (SELECT 1 FROM "FundAllocation" a WHERE a."transactionId"=t.id)
        UNION ALL
        SELECT t.id,a."fundId",t.direction,t.assignment,a.amount FROM scoped t
        JOIN "FundAllocation" a ON a."transactionId"=t.id
      ), selected AS (
        SELECT * FROM shares ${filter.fundId ? Prisma.sql`WHERE "fundId"=${filter.fundId}` : Prisma.empty}
      ), totals AS (
        ${filter.fundId ? Prisma.sql`SELECT id,"fundId",direction,CASE WHEN assignment='AUTO' THEN 'AUTO' ELSE 'MANUAL' END AS assignment,amount FROM selected` : Prisma.sql`SELECT t.id,t."fundId",t.direction,CASE WHEN t."fundId" IS NULL AND NOT EXISTS (SELECT 1 FROM "FundAllocation" a WHERE a."transactionId"=t.id) THEN 'UNASSIGNED' WHEN t.assignment='AUTO' THEN 'AUTO' ELSE 'MANUAL' END AS assignment,t.amount FROM scoped t`}
      )
      SELECT false AS total,"fundId",direction::text,assignment::text,COUNT(DISTINCT id)::bigint AS count,SUM(amount)::bigint AS amount
      FROM selected GROUP BY "fundId",direction,assignment
      UNION ALL
      SELECT true AS total,NULL::text AS "fundId",direction::text,
        assignment::text,
        COUNT(DISTINCT id)::bigint AS count,SUM(amount)::bigint AS amount
      FROM totals GROUP BY direction,assignment
    `),
    client.fund.findMany({ where: filter.fundId ? { id: filter.fundId } : undefined, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  const total = summary();
  for (const group of groups.filter(row => row.total)) add(total, group);
  const byFund = [...funds.map(fund => ({ ...fund, ...summary() })), { id: "", code: "Chưa phân loại", name: "Giao dịch chưa gán thiện pháp", ...summary() }];
  for (const group of groups.filter(row => !row.total)) {
    const target = byFund.find(fund => fund.id === (group.fundId ?? ""));
    if (target) add(target, group);
  }
  return { filter, generatedAt: new Date(), total, funds: byFund.filter(fund => fund.id || fund.income.count || fund.expense.count) };
}
export type FundActivity = Awaited<ReturnType<typeof fundActivity>>;
const cached = unstable_cache(async (filter: ActivityFilter) => encodeAdmin(await fundActivity(filter)), ["fund-activity-v1"], { revalidate: 20, tags: [PUBLIC_TAG, ADMIN_LEDGER_TAG] });
export async function loadFundActivity(filter: ActivityFilter) { return decodeAdmin<FundActivity>(await cached({ ...filter, date: filter.date || localDate() })); }
