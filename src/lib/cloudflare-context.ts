import "server-only";
import {getCloudflareContext} from "@opennextjs/cloudflare";

/** No request context exists during next build, Node scripts, or Vercel requests. */
export function cloudflareContext() {
  try { return getCloudflareContext(); }
  catch { return undefined; }
}
