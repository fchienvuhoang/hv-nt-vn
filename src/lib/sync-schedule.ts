import {BANK_SYNC_MIN_DATE} from "./sync-boundary";
import { localDate, startOfVietnamDay } from "./domain";
// Four direct-DB reconciliation passes; quick minute polls use committed fingerprints.
export const FULL_DAY_TIMES = ["06:00", "12:00", "18:00", "23:50"];
export const PREVIOUS_DAY_TIMES = ["00:01", "06:01"];
export function dueSyncSlots(now: Date) {
  const today = localDate(now);
  const yesterday = localDate(new Date(startOfVietnamDay(today).getTime() - 86400000));
  const due = (times: string[], targetDate: string, kind: string) => times.map(time => ({
    slotKey: `${kind}:${today}:${time}`, kind, targetDate,
    scheduledAt: new Date(`${today}T${time}:00+07:00`),
  })).filter(slot => slot.scheduledAt <= now);
  // On downtime recovery only the latest due slot of each kind is needed:
  // it covers the same whole date as earlier missed slots.
  return [due(FULL_DAY_TIMES, today, "FULL_DAY").at(-1), due(PREVIOUS_DAY_TIMES, yesterday, "PREVIOUS_DAY").at(-1)].filter((s): s is NonNullable<typeof s> => s !== undefined&&s.targetDate>=BANK_SYNC_MIN_DATE);
}
