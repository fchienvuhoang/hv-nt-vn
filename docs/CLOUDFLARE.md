# Deploy qua Git trên Cloudflare Workers

Repo dùng Next.js + OpenNext, giữ nguyên REST API và PostgreSQL hiện có. Không dùng Cloudflare Pages/static export. Không cần chạy lệnh deploy trên máy cá nhân.

## 1. Tạo tài nguyên trong Dashboard

- Tạo một R2 bucket riêng tên `hvntvn-cache` (không bật public access). Dữ liệu cache có cả thông tin quản trị, không dùng chung bucket công khai.
- Tạo Worker kết nối Git repository, tên `hv-nt-vn`. Nếu đặt tên khác, đổi cả `name` và `services[0].service` trong `wrangler.jsonc` cho trùng.
- Dùng Workers Paid: ứng dụng có Next.js, Excel, Prisma và công việc đồng bộ dài; cấu hình CPU tối đa 300 giây trong repo dành cho gói Paid.
- R2 binding, service tự tham chiếu và Durable Objects được khai báo trong `wrangler.jsonc`. Các lớp Durable Objects chỉ quản lý cache/revalidation; dữ liệu thiện pháp vẫn ở PostgreSQL.

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
- Cache snapshot công khai, revision, dấu vân tay đồng bộ và nhật ký vận hành dùng `APP_RUNTIME_CACHE` (SQLite Durable Objects) trong Workers. Các khóa được chia thành 16 shard cho mỗi namespace, với location hint `apac-se`. Gợi ý vị trí không phải bảo đảm placement. Mỗi lần đọc vẫn kiểm tra manifest/revision từ kho dùng chung, không cache mù số dư trong isolate. Không dùng KV eventual consistency cho revision tiền.
- Cache ứng dụng hết hạn được dọn bằng alarm của Durable Object. Nếu đã chạy bản cũ lưu `app-cache/` trên R2, có thể đặt lifecycle rule xóa prefix đó sau 8 ngày; bản mới không đọc prefix này. Không áp rule này cho toàn bộ bucket/incremental cache.
- Cấu hình này không tự tạo lịch đồng bộ. Tiếp tục hệ thống gọi HTTP hiện có: `/api/sync/transactions` và `/api/internal/public-cache`, dùng `Authorization: Bearer <SYNC_SECRET>` như trước. Nếu đổi origin, cập nhật địa chỉ ở nơi gọi lịch.
- Workers chỉ giữ `waitUntil` tối đa khoảng 30 giây sau khi response kết thúc. Các đợt cache/email dài có hàng đợi và cần được gọi tiếp bởi lịch HTTP; không dựa vào một request đơn lẻ để hoàn tất toàn bộ backlog.
- PostgreSQL dùng pool riêng cho từng request (tối đa 3 kết nối), tái sử dụng kết nối giữa các truy vấn của request đó. Worker đợi stream trả về và công việc `waitUntil`/Next `after()` hoàn tất rồi đóng pool; không chia sẻ socket giữa các request. Context không đi qua entry point này giữ chế độ đóng sau mỗi truy vấn để tránh dùng socket sai request.
- `placement.mode = "smart"` để Cloudflare tự đo và chọn nơi chạy phù hợp với database/các dịch vụ phía sau. Hiệu quả phải đo sau deploy với traffic thực; không bảo đảm nhanh hơn Vercel. Asset tĩnh vẫn được phục vụ gần người dùng.
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

## Đồng bộ Variables từ Dashboard

Repo lưu các biến không phải khóa bí mật: `AUTH_GOOGLE_ID`, `AUTH_TRUST_HOST` và `AUTH_URL` production trong `wrangler.jsonc`. Với Preview, Google Client ID được khai báo lại; đặt `AUTH_URL` theo domain Preview thực tế, không dùng URL production nếu đang thử domain khác.

Các biến sau phải tạo ở Dashboard dưới loại **Secret**, không phải Text: `ADMIN_EMAILS`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `DATABASE_URL`, `SYNC_SECRET`. Không copy chúng từ đoạn gợi ý `vars` của Dashboard vào file Git. Nếu đã tạo dạng Text, chuyển sang Secret trước khi deploy để tránh được đưa vào đoạn cấu hình gợi ý công khai. Production và Previews Base có secrets riêng.

`AUTH_URL` của Worker đang là `https://hv-nt-vn.fchienvuhoang-f11.workers.dev`. Vercel giữ `https://hvntvn.danasangha.org` trong cấu hình riêng. `AUTH_URL` chỉ nhận một URL, không phải danh sách phân tách bằng dấu phẩy. Google OAuth cần thêm callback `https://hv-nt-vn.fchienvuhoang-f11.workers.dev/api/auth/callback/google`.

## Tối ưu thời gian trang công khai

Cache ứng dụng chuyển từ các lần đọc R2 tuần tự sang SQLite Durable Objects để giảm độ trễ. R2 tiếp tục phục vụ cache Next.js của OpenNext. `cloudflare/worker.ts` bọc handler OpenNext và xuất thêm lớp cache; không đổi luồng REST hay số liệu PostgreSQL.

Migration `v2-runtime-cache` tạo namespace tự động khi deploy. Không cần tạo bucket/secret mới. Sau lần deploy đầu của phiên bản này, cache ứng dụng mới sẽ còn trống; lượt mở đầu dựng lại snapshot, các lượt sau dùng cache mới. Các bản cache R2 cũ không được đọc lại để tránh phục hồi nhầm dữ liệu đã vô hiệu hóa. Hai chế độ Production và Preview đều có binding cache riêng qua namespace tự động của Cloudflare.

API công khai trả `X-Public-Cache` và `Server-Timing: snapshot;dur=...` để đo riêng thời gian dữ liệu. Chỉ so tốc độ sau khi cache đã được dựng và cùng vị trí mạng; không suy ra hiệu năng production từ phép đo local.

## Giữ biến runtime qua mỗi lần deploy

`keep_vars: true` được bật để Production deploy giữ các biến đã đặt trên Dashboard nhưng không có trong `vars` của repo. Nếu thiếu tùy chọn này, Wrangler mặc định đồng bộ lại biến Text theo file cấu hình và có thể loại bỏ biến chỉ tồn tại ở Dashboard.

Secrets mã hóa được Cloudflare giữ riêng; vẫn đặt `ADMIN_EMAILS`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `DATABASE_URL`, `SYNC_SECRET` dưới loại **Secret**. Nếu một bản deploy trước đã xóa các biến Text, cần khôi phục một lần; `keep_vars` không lấy lại giá trị đã mất. Không lưu giá trị bí mật vào Git để xử lý lỗi này.

## Đăng nhập được nhưng API báo lỗi database

Đăng nhập Google không kiểm tra PostgreSQL. Runtime Production vẫn cần `DATABASE_URL` riêng dưới loại Secret. Nếu biến này bị bỏ khỏi Dashboard, pg có thể thử cấu hình kết nối mặc định và mọi API dữ liệu sẽ lỗi. Repo hiện chặn sớm trường hợp thiếu biến, trả mã `DATABASE_NOT_CONFIGURED` thay vì thử kết nối mặc định.

Sau khi đăng nhập quản trị, mở `/api/admin/runtime-health` để xem các biến có tồn tại hay không, các binding có sẵn và kết quả truy vấn chỉ đọc `SELECT 1`. Endpoint yêu cầu quyền quản trị và không trả giá trị biến, mật khẩu, SQL nghiệp vụ hay dữ liệu thí chủ. Log lỗi database chỉ ghi tên/mã lỗi cùng loại lỗi kết nối.
