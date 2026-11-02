import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Data Cache is used explicitly; keep route-segment auth/runtime controls available.
  cacheComponents: false,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/admin/*": ["./public/branding/hoc-vien-nguyen-thuy-viet-nam.png"],
    "/api/sync/transactions": ["./public/branding/hoc-vien-nguyen-thuy-viet-nam.png"],
  },
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async redirects() {
    return [
      {source:"/:path((?!api(?:/|$)|_next(?:/|$)|sw[.]js$|manifest[.]webmanifest$).*)",has:[{type:"host",value:"hocviennguyenthuy-vietnam.vercel.app"}],destination:"https://hvntvn.danasangha.org/:path",permanent:true},
      {source:"/t/0572-tdts",destination:"/t/0572-ttts",permanent:true},
      {source:"/api/public/funds/0572-tdts",destination:"/api/public/funds/0572-ttts",permanent:true},
    ];
  },
  async headers() {
    return [
      {source:"/sw.js",headers:[{key:"Cache-Control",value:"no-cache, no-store, must-revalidate"},{key:"Content-Type",value:"application/javascript; charset=utf-8"}]},
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default nextConfig;
