# Hùn phước — quản lý thiện pháp

Next.js App Router + TypeScript + PostgreSQL + Prisma ORM. Quản trị bằng Google SSO theo danh sách email được cấp quyền. Hai tài khoản nguồn: `0572` và `0856`.

## Chạy cục bộ

Yêu cầu Node.js 22.18+ và PostgreSQL 14+.

```sh
npm ci
cp .env.example .env
# Điền DATABASE_URL và cấu hình SSO trong .env
npm run db:migrate
npm run db:seed
npm run dev
```

Mở http://localhost:3000 sẽ chuyển thẳng đến `/login`. Quản trị tại `/admin`; mỗi thiện pháp có link công khai riêng `/t/[slug]`, không cần đăng nhập. Không có trang chủ hoặc danh mục thiện pháp công khai.

- `DATABASE_URL`: URL kết nối PostgreSQL có pool (`postgresql://...`) của Prisma Postgres hoặc PostgreSQL khác. Không dùng URL `prisma://` với adapter hiện tại.
- `AUTH_SECRET`: chuỗi ngẫu nhiên tối thiểu 32 ký tự (`openssl rand -base64 32`).
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`: OAuth client của Google.
- `ADMIN_EMAILS`: danh sách email quản trị, phân cách dấu phẩy. Bỏ trống sẽ từ chối tất cả đăng nhập. Chỉ chấp nhận Google email đã xác minh; quyền được kiểm tra lại trên từng trang/thao tác, không chỉ lúc đăng nhập.
- `AUTH_URL`: origin chính thức, ví dụ `https://your-app.vercel.app`.
- `SYNC_SECRET`: chuỗi ngẫu nhiên riêng, tối thiểu 32 ký tự.

Google OAuth authorized redirect URI:

```text
http://localhost:3000/api/auth/callback/google
https://your-app.vercel.app/api/auth/callback/google
```

Không có tài khoản mặc định hoặc cơ chế bỏ qua đăng nhập. Không đưa `.env` lên Git. Seed chỉ tạo hai tài khoản, không tạo thiện pháp hoặc số liệu giả.

## Triển khai Vercel

1. Đẩy repository lên Git và import vào Vercel, chọn Next.js, Node.js 22.x.
2. Tạo Prisma Postgres, cấu hình các biến trên trong Vercel Production. Đặt vùng functions gần database.
3. Chạy `npm run db:migrate` và `npm run db:seed` từ máy/công việc CI có kết nối tới database Production, trước khi mở ứng dụng. Seed có thể chạy lại, không ghi đè tài khoản có sẵn. Nếu database có yêu cầu dùng URL trực tiếp để migration, chạy lệnh với `DATABASE_URL` trực tiếp ở riêng môi trường migration.
4. Build command `npm run build` (bao gồm `prisma generate`). Không chạy migration tự động trong mọi preview deployment. Preview phải dùng database riêng, không dùng chung Production.
5. Cấu hình ngày bắt đầu lấy sao kê trong Đồng bộ & lịch sử, sau đó tạo cron. Không cần chốt sổ hoặc `vercel.json` cron.

Google SSO cần cấu hình thật và kiểm thử tài khoản được cấp quyền/không được cấp quyền trước khi mở cho team. Chưa có credentials nên chưa thể xác minh luồng OAuth với Google thật trong mã nguồn này.

## Đồng bộ mỗi 20 phút từ cron-job.org

Tạo HTTP job:

```text
URL: https://your-app.vercel.app/api/sync/transactions
Method: POST
Schedule: */20 * * * *
Header: Authorization: Bearer <SYNC_SECRET>
```

Không ghi secret vào query string. Scheduler chỉ có quyền yêu cầu đồng bộ, không có quyền sửa thiện pháp hay chuyển tiền.

- Mỗi request tối đa 8 trang, ngân sách xử lý 45 giây, timeout request nguồn 12 giây; `maxDuration=60` trên Vercel. Bắt đầu request nguồn mới chỉ khi còn đủ ngân sách; request dài/cắt đột ngột tiếp tục từ trang đã commit ở lượt sau.
- `SYNC_MAX_PAGES` (1–30), `SYNC_BUDGET_MS` (15.000–45.000) cho phép giảm tải theo timeout của scheduler. Nếu scheduler timeout sớm hơn, đặt ngân sách thấp hơn timeout đó. Công việc bị ngắt chưa commit có thể chạy lại an toàn.
- Lưu tiến độ riêng từng tài khoản và chiều CREDIT/DEBIT. Cửa sổ ngày cố định cho mỗi lượt quét. Sau khi xong, quét chồng lại hai ngày để bắt giao dịch về trễ. Giao dịch nguồn sửa/về trễ quá khoảng chồng lặp cần đối soát và quét lại cửa sổ cũ bằng quy trình vận hành; không khẳng định API là bất biến.
- Khóa lease 120 giây ngăn chạy chồng; tự hết hạn nếu function bị dừng. Cursor chỉ tiến cùng transaction lưu dữ liệu thành công.
- ID nguồn lưu dạng chuỗi, unique `(accountId, sourceId)`; nhập theo lô, loại trùng kể cả nguồn trả `pageSize + 1` phần tử.
- Khi nguồn sửa giao dịch đã có: cập nhật sao kê, giữ nguyên phân loại và ghi lịch sử `SOURCE_UPDATED` để quản trị kiểm tra. Dữ liệu nguồn có thể làm thay đổi tổng thu/chi của thiện pháp đó.
- HTTP 200 `pending: true` nghĩa là đã lưu một phần và còn dữ liệu, không phải đã đồng bộ đầy đủ. HTTP 500 nghĩa là cần kiểm tra nhật ký; các trang đã commit vẫn được giữ.
- Nếu tiến trình bị platform hủy, SyncRun có thể còn RUNNING; kiểm tra thời gian và lease trước khi đánh giá tình trạng. Theo dõi lỗi scheduler và mốc hoàn thành của cả 4 luồng.
- API nguồn `api-pilot.thiennguyen.app` chưa có hợp đồng SLA trong dự án. Cấu trúc, bankAccountId và phân trang cần kiểm tra khi nguồn thay đổi.

## Nhập dữ liệu Google Sheets / Excel

Trang mặc định sau đăng nhập là danh sách thiện pháp tại `/admin`. Tạo thiện pháp, chọn **Nhập Excel**, tải file `.xlsx` xuất từ Google Sheets (File → Download → Microsoft Excel). Hệ thống đọc từng tab, nhận diện TK Mỹ / TK Trâm, xem trước tổng và yêu cầu xác nhận trước khi ghi dữ liệu. Giới hạn 5 MB / 10.000 giao dịch mỗi file.

Một thiện pháp có thể nhận ở cả hai tài khoản; số dư và điều chuyển luôn được theo dõi riêng theo tài khoản. Nhập từng tab, xem tài khoản được nhận diện, tổng thu/chi và lỗi. Không nhập dòng tổng hoặc dòng phụ m²/số vị thành giao dịch. Tổng không khớp cần kiểm tra và xác nhận rõ. File có dòng lỗi phải sửa rồi tải lại.

Nhập chạy từng lô, có thể tiếp tục khi gián đoạn; cùng file/tab không ghi lại lần hai. Giao dịch khớp duy nhất theo mã tham chiếu đầy đủ hoặc thời gian/nội dung/số tiền được ghép với sao kê. Trường hợp nghi trùng đưa vào kiểm tra, chưa cộng tiền cho tới khi quản trị xác nhận. Phân bổ tay ở thiện pháp khác được bảo vệ. Xem [hướng dẫn chuyển đổi](docs/MIGRATION.md).

Không còn chức năng chốt sổ hay điều kiện khóa đồng bộ. Các tổng lịch sử đã tồn tại được giữ; khi thay bằng giao dịch Excel chi tiết, quản trị phải xác nhận thay tổng cũ để tránh cộng hai lần.

## Quy tắc nghiệp vụ

- Một giao dịch gán vào tối đa một thiện pháp có liên kết tài khoản nguồn.
- Mã có ranh giới, không nhầm TP01 với TP010. Chuẩn hóa dấu, chữ hoa/thường, khoảng trắng.
- Mã chính ưu tiên từ khóa mở rộng. Nhiều mã/thiện pháp khớp → chờ kiểm tra. Mã khớp thiện pháp tạm dừng/hoàn thành → chờ tay, không rơi sang từ khóa thiện pháp khác.
- Chỉ ACTIVE nhận tự động. Gán tay có thể chọn PAUSED/COMPLETED, bắt buộc lý do và giữ qua các lượt đồng bộ.
- Thay trạng thái/từ khóa không tự sửa giao dịch cũ. Nút chạy lại chỉ xử lý tối đa 500 giao dịch UNASSIGNED mới nhất. Có thể lọc và gán tay các giao dịch còn lại.
- Điều chuyển phải cùng tài khoản, số tiền dương, đủ số dư. Transaction serializable, thử lại khi xung đột; requestId chống gửi trùng. Không làm tăng tổng hùn/chi. Hủy bằng bút toán đảo duy nhất, có lý do và kiểm tra số dư.
- Tiền dùng BigInt VND, không tính bằng số thực. Giờ nguồn không có offset được hiểu là giờ Việt Nam.
- Số dư dự kiến = tổng số dư thiện pháp + tiền chưa phân bổ theo tài khoản. Thu và chi chỉ tính giao dịch POSTED; REVIEW và MERGED không cộng vào tổng. Số tổng hợp cũ được giữ tương thích cho tới khi thay bằng chi tiết.
- Đây là sổ phân bổ nội bộ, không có chức năng thực hiện chuyển khoản ngân hàng.

## Trang công khai và cache

Dùng Next Data Cache (`unstable_cache`) cho thống kê và từng trang/chiều giao dịch công khai, TTL 1.200 giây. Không chỉ cache trong RAM nên có thể chia sẻ giữa các instance Vercel. Các mutation và endpoint đồng bộ làm hết hạn tag `public-ledger`; lượt xem tiếp theo đọc DB và tạo cache mới. Không hứa mọi lượt xem đều không truy vấn.

Chỉ DTO công khai đã lọc mới vào cache. Không đưa email quản trị, JSON nguồn hoặc thông tin tài khoản đối tác vào public DTO. Nội dung và tên được che mẫu số điện thoại Việt Nam và dạng quốc tế có tiền tố +/00: `0912345678` → `*******678`. Số đã bị nguồn che không thể khôi phục ba số cuối. Tôn trọng `hiddenNarrative` của nguồn. Nhận diện theo mẫu không đảm bảo phát hiện mọi số điện thoại quốc tế hoặc số được viết bằng chữ; cần bổ sung mẫu nếu thực tế có các dạng đó.

Mốc đồng bộ đầy đủ hiển thị thời điểm nhỏ hơn trong hai luồng thu/chi; thời điểm bản cache được tạo hiển thị riêng.

## Kiểm tra

```sh
npm test
npm run typecheck
npm run build
```

Các kiểm tra nghiệp vụ bao gồm: mã trùng tiền tố, từ khóa mơ hồ, mã không hoạt động, tài khoản khác nhau, che điện thoại, BigInt, múi giờ và CSV từ Excel.

Không có secrets hoặc tài khoản Vercel/Google/Prisma Production được đưa vào repository. Việc cấu hình và triển khai Production cần thực hiện với tài khoản của chủ dự án.

### Kiểm thử tích hợp trên PostgreSQL riêng

Tạo database cục bộ có tên bắt đầu bằng `hvntvn_test`, chạy migration với DATABASE_URL trỏ vào database đó, sau đó:

```sh
DATABASE_URL="postgresql://USER@localhost:5432/hvntvn_test" npm run test:integration
```

Script từ chối database không phải test trên localhost; xóa dữ liệu trong database test trước/sau khi chạy. Kiểm tra thu/chi, trang chồng lặp, tiếp tục sau lỗi, thay đổi nguồn, giữ gán tay, lease, điều chuyển lặp, đảo và hai yêu cầu chi cạnh tranh.

`tests/qa-fixtures.mts` và `tests/http-qa.mts` dùng để kiểm tra HTTP/form/cache trên server QA riêng. Fixtures phải được nạp vào database test trống; server QA dùng `NEXT_DIST_DIR=.next-qa`, `AUTH_URL=http://localhost:3001`, ADMIN_EMAILS chứa `qa-admin@example.test` và AUTH_SECRET chỉ dùng thử. HTTP script dùng cùng AUTH_SECRET để tạo session thử, không đăng nhập Google thật. Không chạy server QA với dữ liệu Production.

## Khắc phục Google OAuth redirect_uri_mismatch

Mở Google Cloud → Google Auth Platform → Clients → đúng Web OAuth client tương ứng AUTH_GOOGLE_ID. Trong **Authorized redirect URIs**, thêm chính xác callback ứng dụng đang dùng:

```text
http://localhost:3000/api/auth/callback/google
```

Điền vào Redirect URIs, không phải chỉ Authorized JavaScript origins. Google so khớp chính xác giao thức, hostname, port, đường dẫn và dấu gạch chéo cuối. localhost và 127.0.0.1 là hai hostname khác nhau. Nếu chạy port khác, cập nhật AUTH_URL và URI cùng port. Production cần callback HTTPS theo tên miền thật và AUTH_URL tương ứng, sau đó redeploy.

Để kiểm tra callback thực tế, mở `/api/auth/providers` và xem `google.callbackUrl`. Trên màn hình lỗi Google, phần chi tiết yêu cầu cũng có redirect_uri để đối chiếu. Sau khi lưu Google Cloud, bắt đầu lại đăng nhập từ `/login`. AUTH_SECRET là khóa ngẫu nhiên riêng cho phiên đăng nhập; OAuth client secret thuộc AUTH_GOOGLE_SECRET. Không đặt khóa thật trong .env.example.

### Google trả invalid_client / Client Secret không hợp lệ

Nếu log ghi `invalid_client` và `The provided client secret is invalid`, lỗi xảy ra trước bước kiểm tra ADMIN_EMAILS. Mở đúng OAuth Web client trong Google Cloud, sao chép Client Secret tương ứng vào AUTH_GOOGLE_SECRET trong .env (hoặc Vercel Environment Variables). AUTH_GOOGLE_ID và AUTH_GOOGLE_SECRET phải thuộc cùng client. AUTH_SECRET là khóa phiên ngẫu nhiên riêng, không dùng thay cho Google Client Secret. Không gửi secret qua chat hoặc commit vào Git. Khởi động lại dev server / redeploy rồi bắt đầu một phiên đăng nhập mới.

## Giao diện quản trị

Danh sách thiện pháp là trang mặc định. Bốn mục Thiện pháp, Giao dịch, Điều chuyển và Đồng bộ cùng ở `/admin`. Tạo/cấu hình thiện pháp, nhập Excel, xử lý nghi trùng, chọn ngày đồng bộ và điều chuyển sử dụng modal. Màu đỏ măng cụt, vàng nghệ và cam đất; logo học viện dùng ở đăng nhập, quản trị, trang công khai và favicon.

Kiểm thử nhập Excel trên PostgreSQL riêng:

```sh
DATABASE_URL="postgresql://USER@localhost:5432/hvntvn_test" npm run test:excel-integration
```

Script chỉ chấp nhận database test localhost và dọn dữ liệu test. Kiểm tra nhập nhiều tab/tài khoản, tiếp tục sau gián đoạn, hai yêu cầu đồng thời, chống nhập lại, ghép sao kê hai chiều, bảo vệ phân bổ tay, điều chuyển và thay tổng cũ.
