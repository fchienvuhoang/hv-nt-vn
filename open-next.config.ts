import {defineCloudflareConfig} from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import {withRegionalCache} from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import revalidationQueue from "./cloudflare/revalidation-queue";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: "short-lived",
    // Financial/admin data must still check shared invalidation tags on hits.
    bypassTagCacheOnCacheHit: false,
  }),
  queue: revalidationQueue,
  tagCache: doShardedTagCache,
});
