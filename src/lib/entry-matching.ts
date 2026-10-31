import { createHash } from "node:crypto";
import { normalize, localDate } from "./domain";
export type EntryMatch = {
  id: string;
  origin: string;
  entryStatus: string;
  accountId: string;
  direction: string;
  amount: bigint;
  occurredAt: Date;
  narrative: string;
  refId: string;
  fundId: string | null;
  assignment: string;
  matchKey: string;
};
export function ledgerMatchKey(input: {
  direction: string;
  amount: bigint | string;
  at: Date | string;
  narrative: string;
}) {
  // Use the minute because both the source API and old Sheets have minute precision.
  const minute = new Date(input.at).toISOString().slice(0, 16);
  return createHash("sha256")
    .update(
      [
        input.direction,
        String(input.amount),
        minute,
        normalize(input.narrative),
      ].join("|"),
    )
    .digest("hex");
}
export function chooseEntryMatch(
  input: {
    direction: string;
    amount: bigint;
    at: Date;
    narrative: string;
    refId: string;
  },
  candidates: EntryMatch[],
): { exact: EntryMatch | null; suspected: EntryMatch[] } {
  const pool = candidates.filter(
    (c) =>
      c.entryStatus === "POSTED" &&
      c.direction === input.direction &&
      c.amount === input.amount,
  );
  const byRef = input.refId
    ? pool.filter(
        (c) => c.refId && c.refId.toUpperCase() === input.refId.toUpperCase(),
      )
    : [];
  const key = ledgerMatchKey(input);
  const exact = byRef.length
    ? byRef
    : pool.filter(
        (c) =>
          (c.matchKey ||
            ledgerMatchKey({
              direction: c.direction,
              amount: c.amount,
              at: c.occurredAt,
              narrative: c.narrative,
            })) === key,
      );
  if (exact.length === 1)
    return { exact: exact[0], suspected: [] as EntryMatch[] };
  const suspected = pool.filter(
    (c) => localDate(c.occurredAt) === localDate(input.at),
  );
  return { exact: null, suspected: exact.length > 1 ? exact : suspected };
}
