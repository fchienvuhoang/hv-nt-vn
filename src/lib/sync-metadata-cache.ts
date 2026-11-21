import 'server-only';
import {unstable_cache} from 'next/cache';
import {ADMIN_LEDGER_TAG,ADMIN_SYNC_TAG} from './cache-tags';
import {syncAccountStatus} from './sync-status';

// Status changes on webhook completion or account edits, not elapsed time.
export const cachedSyncAccountStatus=unstable_cache(syncAccountStatus,
 ['sync-account-status-events-v2'],{revalidate:false,tags:[ADMIN_SYNC_TAG,ADMIN_LEDGER_TAG]});
