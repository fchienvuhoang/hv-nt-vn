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

## Đồng bộ mỗi phút từ cron-job.org

```text
URL: https://your-app.vercel.app/api/sync/transactions
Method: POST
Schedule: * * * * *
Timeout: 30 seconds
Header: Authorization: Bearer <SYNC_SECRET>
```

Đặt `SYNC_BUDGET_MS=20000` trên Vercel; mặc định webhook mới là 20 giây. Không ghi secret vào URL. Endpoint chỉ có quyền đồng bộ. `SYNC_MAX_PAGES` mặc định 8, giới hạn 4–30 trang cho mỗi webhook; thu/chi của hai tài khoản dùng chung ngân sách. Nút Đồng bộ ngay vẫn dùng cơ chế quét lịch sử thủ công, mặc định ngân sách 45 giây.

- Lấy mới: trang 20 giao dịch trong ngày; tiếp tục qua các lượt nếu chưa hết. Dừng khi hết nguồn hoặc một trang đều đã có ID. Giao dịch cũ về trễ/sửa được bắt lại bằng đợt quét toàn ngày, không dựa vào lượt lấy mới để khẳng định ngày đã đối chiếu xong.
- Quét toàn ngày hiện tại 10 mốc giờ Việt Nam: 02:00, 04:00, 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 22:00. Quét ngày hôm trước lúc 00:01 và 06:01. Mỗi trang 100 bản ghi, không dừng ở ID cũ.
- Lịch chỉ được kích hoạt khi webhook gọi vào. Mốc trễ chạy ở lượt tiếp theo; sau thời gian ngừng dài chỉ bù mốc gần nhất cho cùng ngày, không quét lại mọi mốc đã lỡ. Không có scheduler nội bộ độc lập.
- Một đợt quét là một SyncJob có khóa mốc duy nhất; cursor, dữ liệu và bộ đếm trang commit cùng transaction. Nếu chưa xong/nguồn lỗi thì lượt webhook sau tiếp tục. Quét ngày và lấy mới được luân phiên ưu tiên để không bỏ đói nhau khi ngân sách thấp. Lịch sử từ ngày cấu hình cũ được xử lý bằng job HISTORY khi chưa được phủ bởi đồng bộ cũ.
- Lease database 120 giây, gia hạn khi commit, dùng chung với đồng bộ thủ công và cấu hình. Lượt gọi chồng trả 200 skipped và vẫn ghi thống kê. IDs nguồn unique theo tài khoản; dữ liệu nguồn sửa giữ phân loại và ghi audit.
- Tab Đồng bộ & lịch sử có Webhook mỗi phút, Quét toàn ngày, Đồng bộ thủ công và Lịch sử thao tác. Thống kê webhook hợp lệ bao gồm cả bị bỏ qua/lỗi. Thống kê đợt quét đếm riêng mốc, số lượt xử lý, giờ đến hạn/bắt đầu/gọi gần nhất/hoàn tất. Thống kê mới bắt đầu từ bản cập nhật này; không suy đoán lượt gọi trong quá khứ. Request sai secret bị từ chối, không ghi thành lượt sync hợp lệ.
- Không xóa record nguồn hay đặt lại số tiền. REVIEW và MERGED vẫn tuân thủ quy tắc sổ cái. Không cập nhật công khai bằng polling toàn trang; chỉ API trạng thái nhỏ mỗi phút khi tab được mở.

## Nhập dữ liệu Google Sheets / Excel

Trang mặc định sau đăng nhập là danh sách thiện pháp tại `/admin`. Tạo thiện pháp, chọn **Nhập Excel**, tải file `.xlsx` xuất từ Google Sheets (File → Download → Microsoft Excel). Hệ thống đọc từng tab, nhận diện TK Mỹ / TK Trâm, xem trước tổng và yêu cầu xác nhận trước khi ghi dữ liệu. Giới hạn 5 MB / 10.000 giao dịch mỗi file.

Mọi thiện pháp mặc định nhận và chi ở cả hai tài khoản; phần tài khoản trong biểu mẫu là chỉ đọc, không thể giới hạn bằng dữ liệu gửi lên. Mã thiện pháp là duy nhất toàn hệ thống; số dư và điều chuyển luôn được theo dõi riêng theo tài khoản. Nhập từng tab, xem tài khoản được nhận diện, tổng thu/chi và lỗi. Không nhập dòng tổng hoặc dòng phụ m²/số vị thành giao dịch. Tổng không khớp cần kiểm tra và xác nhận rõ. File có dòng lỗi phải sửa rồi tải lại.

Nhập chạy từng lô, có thể tiếp tục khi gián đoạn; cùng file/tab không ghi lại lần hai. Giao dịch khớp duy nhất theo mã tham chiếu đầy đủ hoặc thời gian/nội dung/số tiền được ghép với sao kê. Trường hợp nghi trùng đưa vào kiểm tra, chưa cộng tiền cho tới khi quản trị xác nhận. Phân bổ tay ở thiện pháp khác được bảo vệ. Xem [hướng dẫn chuyển đổi](docs/MIGRATION.md).

Không còn chức năng chốt sổ hay điều kiện khóa đồng bộ. Các tổng lịch sử đã tồn tại được giữ; khi thay bằng giao dịch Excel chi tiết, quản trị phải xác nhận thay tổng cũ để tránh cộng hai lần.

## Quy tắc nghiệp vụ

- Một giao dịch gán vào tối đa một thiện pháp có liên kết tài khoản nguồn.
- Mã có ranh giới, không nhầm TP01 với TP010. Nhận TP112 / tp 112 / T P 112 và từ khóa viết liền hoặc cách. Chuẩn hóa dấu và chữ hoa/thường.
- Tạo/sửa thiện pháp kiểm tra mã và toàn bộ từ khóa với mọi thiện pháp, kể cả tạm dừng/hoàn thành. Khóa so sánh bỏ dấu, hoa/thường và mọi khoảng trắng; báo rõ dòng nhập, từ khóa/mã trùng và mã/tên thiện pháp đang sử dụng. Các lần lưu đồng thời dùng transaction serializable để không nhận trùng từ khóa.
- Mã chính ưu tiên từ khóa mở rộng. Nhiều mã/thiện pháp khớp → chờ kiểm tra. Mã khớp thiện pháp tạm dừng/hoàn thành → chờ tay, không rơi sang từ khóa thiện pháp khác.
- Chỉ ACTIVE nhận tự động. Gán tay có thể chọn PAUSED/COMPLETED, bắt buộc lý do và giữ qua các lượt đồng bộ.
- Thay trạng thái/từ khóa không tự sửa giao dịch cũ. Bảng giao dịch mặc định lọc hôm nay theo giờ Việt Nam; có Từ ngày / Đến ngày. Không có nút phân loại ở tab Tất cả. Trong tab Chưa phân loại hoặc từng thiện pháp có Kiểm tra phân loại tab: chụp danh sách toàn bộ giao dịch của tab trong khoảng ngày/tài khoản/thu chi/tìm kiếm đang lọc, xử lý theo lô 100 dòng có lưu tiến độ, không giới hạn ở trang đang hiển thị. Bước kiểm tra chỉ lập đề xuất; quản trị xác nhận rồi mới áp dụng. AUTO có thể chuyển sang mã phù hợp hoặc về Chưa phân loại; MANUAL (kể cả Excel), REVIEW và MERGED được giữ nguyên. Giao dịch vừa bị sửa hoặc gán tay trong lúc chạy được bỏ qua. Cấu hình thay đổi làm lượt cũ hết hiệu lực và phải kiểm tra lại. Phân bổ lịch sử đúng mã của thiện pháp tạm dừng/hoàn thành vẫn được giữ, không gán thêm tự động. Mọi thay đổi có audit và tác giả; đóng modal dừng sau lô đang chạy và có thể tiếp tục khi mở lại cùng phạm vi.
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

## Thông báo và lịch sử người thao tác

Các mutation quản trị dùng toast thành công/lỗi. Lỗi validation thiện pháp vẫn hiện đỏ tại ô nhập và giữ nguyên dữ liệu. Form bị khóa khi pending; tạo/sửa thiện pháp thành công đóng modal. Toast dùng top layer để không bị modal che.

Danh tính lấy từ phiên Google SSO đã kiểm tra quyền ở server, không nhận ID/tên từ form. AuditLog ghi email, ID đăng nhập, tên tại thời điểm thao tác, hành động, mã bản ghi, chi tiết và createdAt. Fund giữ người tạo/cập nhật cùng createdAt/updatedAt; giao dịch giữ người nhập/cập nhật và timestamp, điều chuyển và batch Excel giữ danh tính tác giả. Đồng bộ tự động được đánh dấu system:cron. Trường danh tính cũ chưa từng lưu để NULL và hiển thị chưa có thông tin, không suy đoán tác giả lịch sử.

Tab Giao dịch có Tất cả / Chưa phân loại với số lượng theo phạm vi bộ lọc (không giới hạn ở trang 100 dòng). Xem thêm mở modal tìm mã/tên thiện pháp và số giao dịch trên toàn lịch sử đáp ứng các bộ lọc ngoài ngày. Chọn thiện pháp tạo tab riêng, mở khoảng ngày từ giao dịch cũ nhất tới hôm nay; vẫn giữ tài khoản, thu/chi, tìm kiếm và đối chiếu. Lọc lại ngày vẫn giữ tab đang chọn; đổi tab đặt lại phân trang. Bộ đếm dùng groupBy chung, không truy vấn riêng từng thiện pháp.


## Gán nhiều giao dịch và ghi chú công khai

Tại danh sách thiện pháp, bấm **Xem giao dịch** để mở modal đã tải sẵn, lấy giao dịch qua REST API có kiểm tra đăng nhập. Tìm/lọc, chọn tối đa 500 giao dịch qua nhiều trang, kiểm tra tổng thu/chi theo tài khoản, chọn thiện pháp nhận và nhập lý do chung. Các khoản được gán `MANUAL`, lưu lịch sử người thực hiện và tự thêm giải thích công khai ở từng giao dịch. Nếu một khoản đã bị sửa sau lúc chọn, toàn bộ lượt bị hủy để quản trị chọn lại; gửi lại cùng mã yêu cầu không nhập lặp. Tài khoản ngân hàng, tiền và nội dung gốc không đổi.

Có thể thêm nhiều ghi chú công khai từ modal hoặc tab giao dịch. Ghi chú được lưu bổ sung, có người viết/thời gian và không ghi đè nội dung nguồn. Trang công khai che số điện thoại trong ghi chú, giữ 3 số cuối, và dùng chung cache có làm mới sau thao tác. Áp dụng migration `20261031090000_transaction_notes` trước khi chạy phiên bản này.

Kiểm thử riêng trên cơ sở dữ liệu localhost dùng tên bắt đầu `hvntvn_test`: `npm run test:transaction-management`.


## Điều hướng và REST API

Khung quản trị và mã các modal được tải sẵn. Menu chính, tab trạng thái thiện pháp, nhóm giao dịch, nhật ký, bộ lọc và phân trang đổi URL bằng History API; dữ liệu được lấy từ `/api/admin/...`, không tải lại RSC hay giao diện. Các thao tác lưu trả JSON và làm mới cache dữ liệu liên quan. API kiểm tra phiên, email quản trị và nguồn gửi yêu cầu ghi; dữ liệu quản trị không cache ở trình duyệt trung gian. Số tiền và thời gian được truyền bằng codec bảo toàn BigInt/Date.

Trang công khai giữ SSR cho lần truy cập đầu; chuyển thu/chi, tìm kiếm và phân trang gọi `/api/public/funds/[slug]`. Dữ liệu công khai dùng cache server hiện có, chỉ trả nội dung đã che số điện thoại và không trả danh tính quản trị viên.

## Thống kê giao dịch và số dư nguồn

Tab Giao dịch lấy `/api/admin/transaction-summary` (REST có phân quyền, cache server 20 giây). Ba ô ngày đặt cạnh nhau, thanh thu/chi dùng chung thang đo số tiền. Thống kê hôm nay và hai ngày trước theo giờ Việt Nam, độc lập bộ lọc danh sách, chỉ cộng giao dịch `POSTED`; không cộng nghi trùng, bản gộp hoặc điều chuyển nội bộ.

Tab Thiện pháp dùng dữ liệu bootstrap đã có để đối chiếu hai khu vực: số dư nguồn (tổng thu trừ tổng chi) và tổng số dư đã phân bổ vào toàn bộ thiện pháp, có phân tách từng tài khoản. Chênh lệch = nguồn − phân bổ; không cộng tiền chưa phân loại vào số dư thiện pháp. Tổng phân bổ giữ các điều chuyển/điều chỉnh lịch sử của sổ hiện có, tính cả thiện pháp hoàn thành/tạm dừng và không đổi theo bộ lọc danh sách. Cache bootstrap được làm mới khi webhook cập nhật bản tổng hợp nguồn.

Webhook mỗi phút giữ lease chung, gọi song song API `bank-account-transaction/{accountNo}/transactionsV2?pageSize=1&pageNumber=1` mà trang sao kê Thiện Nguyện sử dụng (timeout 4 giây), xác thực username/số tài khoản/userId rồi lưu tổng thu, tổng chi và thời điểm lấy thành công. Số dư hiển thị bằng tổng thu trừ tổng chi nguồn, tách biệt sổ phân bổ thiện pháp. Không dùng tổng tiền trong HTML `__NEXT_DATA__` vì đó là bản tổng hợp hồ sơ khác với trang sao kê. API không trả thời điểm cập nhật số dư; giờ hiển thị chỉ là lúc lấy thành công. Không lưu danh sách giao dịch kèm theo phản hồi tổng hợp. Nguồn lỗi giữ nguyên số liệu cũ và báo lỗi; thiếu bản tổng hợp của một tài khoản thì không hiển thị tổng hai tài khoản như một số dư đầy đủ. Phản hồi webhook có `balances` ghi kết quả từng tài khoản. Lượt bị skip do đang chạy không gọi nguồn lần nữa.

Áp dụng migration `20261031100000_source_balances` trước khi chạy phiên bản này. Kiểm thử: `npm run test:transaction-summary` và `npm run test:scheduled-sync` với database localhost `hvntvn_test...` riêng, không dùng dữ liệu thật.

## Link tổng hợp công khai

Gửi `/t` để thí chủ xem danh sách thiện pháp `ACTIVE`, tổng hùn phước/chi/số dư và mở trang chi tiết. Nút mở link này có trong tab Thiện pháp; trang chi tiết có đường quay về danh sách. Trang chủ `/` vẫn dẫn tới đăng nhập.

Tìm kiếm trên `/t` gọi REST `/api/public/funds?q=...&page=...`, giữ URL và Back/Forward bằng History API. Tìm theo mã/tên thiện pháp hoặc nội dung/người chuyển/số tiền/ghi chú công khai ở cả hai chiều thu chi. Mỗi thiện pháp trả tối đa ba khoản xem trước và số kết quả đầy đủ; nút chi tiết giữ từ khóa và chiều giao dịch. Khoản chưa phân loại, nghi trùng, bản gộp và thiện pháp tạm dừng/hoàn thành không nằm trong kết quả tổng hợp.

Cache server dùng chung tag `public-ledger`, TTL 20 phút, được vô hiệu hóa sau thay đổi. Danh sách và các khối giao dịch được cache theo trang cố định, không theo từ khóa của khách. Chỉ tìm trên DTO đã che số điện thoại; không gửi source thô hoặc danh tính quản trị viên. Kiểm thử `npm run test:public-directory` cần database test localhost trống và QA server dùng cùng database.

## Ghim thiện pháp trong quản trị

Nút ghim cạnh mã thiện pháp lưu `Fund.pinnedAt`; các mục được ghim xếp đầu danh sách quản trị, mục ghim gần nhất đứng trước. Bỏ ghim trả về thứ tự mặc định. Bộ lọc/trạng thái vẫn được giữ; ghim không thay đổi trang công khai hoặc số liệu tài chính. REST `PATCH /api/admin/funds/pin` có kiểm tra quyền/nguồn yêu cầu, lưu người sửa và nhật ký thao tác. Áp dụng migration `20261031110000_fund_pins`.
