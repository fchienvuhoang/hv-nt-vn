import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { TransferFormFields } from "./transfer-form-fields";
import type { fundTotals } from "@/lib/ledger";
export async function TransferForm({
  funds,
}: {
  funds: Awaited<ReturnType<typeof fundTotals>>;
}) {
  const accounts = await db.bankAccount.findMany({
    select: { id: true, number: true, label: true },
    orderBy: { number: "asc" },
  });
  return (
    <TransferFormFields
      requestId={randomUUID()}
      accounts={accounts}
      funds={funds.map((f) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        accountId: f.accountId,
        accountIds: f.accountIds,
        byAccount: f.byAccount.map((a) => ({
          accountId: a.accountId,
          balance: a.balance.toString(),
        })),
      }))}
    />
  );
}
