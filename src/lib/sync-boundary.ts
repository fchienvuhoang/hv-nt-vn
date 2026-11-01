import {parseSourceTime,startOfVietnamDay} from './domain';
/** Historical transactions belong to the Excel migration, never automatic bank sync. */
export const BANK_SYNC_MIN_DATE='2026-11-01';
export const BANK_SYNC_MIN_ISO='2026-10-31T17:00:00.000Z';
export function effectiveSyncStart(configured?:Date|null){return new Date(Math.max(startOfVietnamDay(BANK_SYNC_MIN_DATE).getTime(),configured?.getTime()??0))}
export function allowedBankSyncTime(value:string){return parseSourceTime(value).getTime()>=Date.parse(BANK_SYNC_MIN_ISO)}
