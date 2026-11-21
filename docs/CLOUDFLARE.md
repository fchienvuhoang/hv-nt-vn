# Deploy qua Git trên Cloudflare Workers

Repo dùng Next.js + OpenNext, giữ nguyên REST API và PostgreSQL hiện có. Không dùng Cloudflare Pages/static export. Không cần chạy lệnh deploy trên máy cá nhân.

## 1. Tạo tài nguyên trong Dashboard

- Tạo một R2 bucket riêng tên `hvntvn-cache` (không bật public access). Dữ liệu cache có cả thông tin quản trị, không dùng chung bucket công khai.
- Tạo Worker kết nối Git repository, tên `hv-nt-vn`. Nếu đặt tên khác, đổi cả `name` và `services[0].service` trong `wrangler.jsonc` cho trùng.
- Dùng Workers Paid: ứng dụng có Next.js, Excel, Prisma và công việc đồng bộ dài; cấu hình CPU tối đa 300 giây trong repo dành cho gói Paid.
- R2 binding, service tự tham chiếu và Durable Objects được khai báo trong `wrangler.jsonc`. Hai lớp Durable Objects chỉ quản lý cache/revalidation; dữ liệu thiện pháp vẫn ở PostgreSQL.

## 2. Cấu hình Workers Builds

| Mục | Giá trị |
| --- | --- |
| Production branch trên Cloudflare | `cf` (Vercel tiếp tục dùng `main`) |
| Root directory | `/` (gốc repository) |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Non-production branches | Tắt automatic builds khi chỉ theo dõi nhánh `cf` |
| Node.js build version | `22.19.0` hoặc một bản Node 22 từ 22.18 trở lên |

Cloudflare chạy các lệnh deploy này tự động trong hệ thống build sau khi bạn nối Git; không cần đăng nhập Wrangler trên máy cá nhân. `build:cloudflare` đã chạy `prisma generate` và `next build`, không chạy thêm `npm run build` trước đó. Chỉ dùng một package manager trong build: npm với `package-lock.json`. Repo đã bỏ `yarn.lock`, ghim `packageManager: npm@10.9.3` và `.node-version: 22.19.0` để Cloudflare không tự chọn Yarn 4/Node 24. Nếu Dashboard có Build variable `NODE_VERSION`, đặt `22.19.0` hoặc bỏ biến ghi đè đó.

## 3. Biến môi trường và secrets

Đặt **runtime Variables/Secrets** trong Worker Settings, không chỉ đặt ở mục Build variables. Xem danh sách trong `.env.example`.

Bắt buộc:

- `DATABASE_URL`: URL PostgreSQL dạng `postgresql://...`, cùng database hiện tại. URL cần truy cập được từ Cloudflare, hỗ trợ TLS; không dùng `localhost` trong production.
- `AUTH_SECRET`: giữ giá trị hiện tại nếu muốn bảo toàn phiên đăng nhập.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAILS`.
- `AUTH_URL`: origin thật của Worker/custom domain, ví dụ `https://hvntvn.danasangha.org`.
- `AUTH_TRUST_HOST=true`.
- `SYNC_SECRET`: giữ giá trị mà hệ thống gọi đồng bộ đang dùng.

Giữ các biến VAPID, Resend và cấu hình đồng bộ nếu đang sử dụng thông báo/email. Secrets phải có cả ở preview nếu muốn thử các chức năng liên quan; nên dùng database/secrets thử nghiệm riêng cho preview.

Không đưa secrets vào `wrangler.jsonc`, Git hay các biến `NEXT_PUBLIC_*`. Cloudflare build không cần database production để sinh Prisma Client hoặc build khung trang. OpenNext có thể đóng gói `.env*` nếu chúng tồn tại trong môi trường build; không tạo file `.env` chứa secrets production trong CI. Runtime bindings là nguồn secrets production.

## 4. Domain và đăng nhập

- Khi chuyển domain sang Worker, cập nhật Google OAuth authorized redirect URI thành `https://<domain>/api/auth/callback/google`.
- Dùng cùng `AUTH_URL` với domain người dùng truy cập.
- Vercel config vẫn được giữ để repo có thể deploy ở cả hai nền tảng; `vercel.json` không quyết định nơi chạy Worker.
- Analytics của Vercel được tắt riêng trong bản build Cloudflare.

## 5. Cache và công việc nền

- Cache Next.js dùng R2 + Durable Objects để hỗ trợ `unstable_cache` và vô hiệu hóa theo tag.
- Cache snapshot công khai, revision, dấu vân tay đồng bộ và nhật ký vận hành chuyển từ Vercel Runtime Cache sang R2 trong Workers. R2 đọc/ghi nhất quán; không dùng KV eventual consistency cho revision tiền.
- Có thể đặt lifecycle rule xóa object trong prefix `app-cache/` sau 8 ngày để dọn các phiên bản snapshot hết hạn. Không áp rule này cho toàn bộ bucket/incremental cache.
- Cấu hình này không tự tạo lịch đồng bộ. Tiếp tục hệ thống gọi HTTP hiện có: `/api/sync/transactions` và `/api/internal/public-cache`, dùng `Authorization: Bearer <SYNC_SECRET>` như trước. Nếu đổi origin, cập nhật địa chỉ ở nơi gọi lịch.
- Workers chỉ giữ `waitUntil` tối đa khoảng 30 giây sau khi response kết thúc. Các đợt cache/email dài có hàng đợi và cần được gọi tiếp bởi lịch HTTP; không dựa vào một request đơn lẻ để hoàn tất toàn bộ backlog.
- Không tự động chạy migration database trong build/deploy. Repo không thay đổi cấu trúc hay số tiền khi chuyển nền tảng.

## 6. Kiểm tra sau lần deploy đầu

1. Mở `/login`, đăng nhập Google, thử tìm/lọc/chuyển tab trong quản trị.
2. Mở một trang `/t/<slug>` và kiểm tra tìm kiếm, số dư, phân trang.
3. Kiểm tra endpoint đồng bộ và public-cache có xác thực, xem log Worker để xác nhận không có lỗi binding/DB.
4. Kiểm tra email và Web Push nếu đang bật; logo email được lấy qua ASSETS binding thay vì đọc filesystem.

## Kiểm tra cục bộ (tùy chọn)

`npm run build:cloudflare` chỉ build, không tạo Worker/tài nguyên và không deploy. `npm run preview:cloudflare` chạy Workers runtime cục bộ với `.dev.vars` (file này bị Git ignore); chỉ sử dụng dữ liệu thử nghiệm. `npm run build` vẫn dùng cho Next.js/Vercel thông thường.

## Chạy song song với Vercel để theo dõi

- Giữ domain chính trên Vercel, gắn một domain thử riêng cho Worker (hoặc dùng `hv-nt-vn.<account>.workers.dev`). Chưa cần chuyển DNS của domain chính.
- Cả hai dùng cùng Git branch; mỗi nền tảng chạy đúng build command của mình. Không đổi Build command trên Vercel thành `build:cloudflare`.
- Nếu dùng chung PostgreSQL, mọi thao tác ghi/điều chuyển ở cả hai bản đều tác động vào dữ liệu thật. Giai đoạn theo dõi chỉ đọc ở Cloudflare; thao tác quản trị có ghi vẫn thực hiện ở Vercel. Đây là quy trình vận hành, chưa phải một chế độ read-only bị chặn bằng kỹ thuật.
- Chỉ duy trì một nơi gọi lịch đồng bộ/gửi thông báo. Không nhân đôi lịch sang Cloudflare. Các khóa/idempotency trong database có hỗ trợ chống trùng, nhưng không nên dùng chúng để thay thế việc phân công một lịch chính.
- R2 và Vercel Runtime Cache độc lập. Dữ liệu đã lưu ở database vẫn chung, nhưng kết quả công khai ở bản kia có thể cũ cho đến khi hàng đợi refresh được xử lý ở nền tảng đó. Muốn so sánh số dư phải làm mới cache của cả hai trước; không kết luận chênh lệch tiền chỉ từ hai trang cache khác thời điểm.
- Với Google OAuth, thêm callback cho domain thử và đặt `AUTH_URL` riêng theo từng nền tảng. Muốn không chạm dữ liệu thật khi thử thao tác, dùng bản sao database riêng cho Cloudflare.

Bộ kiểm tra Workers tại `tests/cloudflare-smoke.mts` chỉ cho phép URL localhost và database `hvntvn_test_worker_*`; kiểm tra login, bảo vệ API, asset logo, nhiều request PostgreSQL nối tiếp, tìm kiếm công khai và làm mới cache. Nó tạo rồi dọn dữ liệu QA, không dùng database production.

## Worker Previews cho nhánh/PR

Repo có `previews` block riêng:

- Tạo thêm R2 bucket **`hvntvn-cache-preview`** trong Dashboard. Cache Preview tách khỏi bucket chính `hvntvn-cache`. Nếu thử nhiều nhánh Preview đồng thời, cấu hình bucket riêng cho từng nhánh để tránh dùng chung cache giữa các nhánh.
- Giữ lớp/migration Durable Objects ở top level; các binding được khai báo lại trong `previews.durable_objects`. Cloudflare tự tạo namespace riêng cho từng Preview.
- Không khai báo service tự tham chiếu trong Preview vì service binding của Preview gọi bản production. Với `HVNTVN_PREVIEW=1`, OpenNext làm mới cache ngay trong Preview qua internal fetch; bản chính vẫn dùng Durable Object queue như trước.
- Đặt variables/secrets ở **Settings → Previews Base**, đặc biệt `DATABASE_URL`, khóa đăng nhập và allowlist. Preview không tự lấy đầy đủ secrets production. Chọn database thử nghiệm nếu muốn thao tác không tác động dữ liệu thật.
- Non-production deploy command: **`npm run deploy:preview:cloudflare`**. Production deploy command vẫn **`npm run deploy:cloudflare`**.
- `npm run upload:cloudflare` tạo Version URL dùng tài nguyên production, khác với Worker Preview cô lập.

Nếu chỉ cần một bản Cloudflare song song với Vercel, chọn Production branch của Worker = `cf`. Khi đó không cần bật builds cho nhánh khác hoặc cấu hình Preview secrets; Vercel vẫn tiếp tục dùng `main`.
