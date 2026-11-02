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

Gửi `/minh-bach` để thí chủ xem danh sách thiện pháp `ACTIVE`, tổng hùn phước/chi/số dư và mở trang chi tiết. Nút mở link này có trong tab Thiện pháp; trang chi tiết có đường quay về danh sách. Trang chủ `/` vẫn dẫn tới đăng nhập.

Tìm kiếm trên `/minh-bach` gọi REST `/api/public/funds?q=...&page=...`, giữ URL và Back/Forward bằng History API. Tìm theo mã/tên thiện pháp hoặc nội dung/người chuyển/số tiền/ghi chú công khai ở cả hai chiều thu chi. Mỗi thiện pháp trả tối đa ba khoản xem trước và số kết quả đầy đủ; nút chi tiết giữ từ khóa và chiều giao dịch. Khoản chưa phân loại, nghi trùng, bản gộp và thiện pháp tạm dừng/hoàn thành không nằm trong kết quả tổng hợp.

Cache server dùng chung tag `public-ledger`, TTL 20 phút, được vô hiệu hóa sau thay đổi. Danh sách tổng hợp dùng cache riêng; giao dịch cache theo từng thiện pháp, chiều và trang cố định, không theo từ khóa của khách. Tìm kiếm tổng hợp tái sử dụng các trang đã che dữ liệu này. Chỉ tìm trên DTO đã che số điện thoại; không gửi source thô hoặc danh tính quản trị viên. Kiểm thử `npm run test:public-directory` cần database test localhost trống và QA server dùng cùng database.

## Ghim thiện pháp trong quản trị

Nút ghim cạnh mã thiện pháp lưu `Fund.pinnedAt`; các mục được ghim xếp đầu danh sách quản trị, mục ghim gần nhất đứng trước. Bỏ ghim trả về thứ tự mặc định. Bộ lọc/trạng thái vẫn được giữ; ghim không thay đổi trang công khai hoặc số liệu tài chính. REST `PATCH /api/admin/funds/pin` có kiểm tra quyền/nguồn yêu cầu, lưu người sửa và nhật ký thao tác. Áp dụng migration `20261031110000_fund_pins`.

Trang tổng hợp `/minh-bach` hiển thị dạng danh sách dọc, chỉ lấy thiện pháp `ACTIVE` và `publicListed=true`. Nút con mắt ngay cột Công khai trong bảng quản trị bật/tắt và lưu ngay qua REST `PATCH /api/admin/funds/visibility`, có toast, ghi người sửa và lịch sử thao tác. Mặc định false (kể cả dữ liệu cũ); quản trị cần chủ động bật từng thiện pháp. `/t` chuyển hướng sang `/minh-bach` và giữ từ khóa/phân trang; URL chi tiết `/t/[slug]` được giữ nguyên. Tùy chọn chỉ kiểm soát danh sách/tìm kiếm tổng hợp, không khóa link chi tiết đã chia sẻ. Áp dụng migration `20261031120000_public_listing`.

## Giảm database operations (01/11/2026)

- Giữ cron mỗi phút, đủ 10 lượt quét trong ngày và hai lượt đối soát ngày trước, khóa PostgreSQL và lịch sử mọi invocation.
- Đọc các job đang chờ và khóa lịch dự kiến trong một truy vấn; tạo các job thiếu theo lô. Không upsert lại từng slot đã tồn tại mỗi phút. Trạng thái còn việc được tính từ các job đã nạp.
- Kiểm tra sourceId/hash một lần mỗi trang; trang không đổi/rỗng bỏ qua đọc từ khóa và đối chiếu Excel. Giao dịch nguồn bị sửa vẫn được cập nhật, giữ phân loại thủ công và ghi audit. Cursor job và counters invocation được ghi cùng một SQL CTE trong transaction nhập trang, nên vẫn khớp nếu tiến trình dừng sau commit.
- Nguồn số dư vẫn được gọi mỗi phút. Lưu ngay khi tổng thu/chi thay đổi hoặc có lỗi/hồi phục; số dư không đổi và lỗi lặp được ghi heartbeat mỗi 5 phút. `sourceFetchedAt` là thời điểm bản thành công được lưu gần nhất, không phải thời điểm kiểm tra mới nhất từng phút. Không dùng RAM của instance làm khóa/cache tài chính.
- `/api/admin/revision` kiểm tra phiên bản dữ liệu qua một truy vấn cache 30 giây. Các màn hình quản trị đang mở kiểm tra phiên bản mỗi phút và chỉ đọc lại dữ liệu khi phần liên quan thay đổi; thao tác lưu vẫn làm mới ngay. Trạng thái sync được cache dùng chung 15 giây; bootstrap tái dùng accounts/states đã đọc.
- Đồng bộ có giao dịch thay đổi chỉ vô hiệu hóa cache quản trị, danh sách tổng hợp và các thiện pháp bị ảnh hưởng. Cache trang/chiều giao dịch của các thiện pháp khác được giữ. Thay đổi cấu hình thủ công vẫn dùng invalidation rộng để tránh bỏ sót.

Đo trên database test, cùng 3 invocation không đổi, 2 tài khoản × 2 chiều, 80 giao dịch đã biết: trước 198 câu SQL, sau 117 (giảm 41%). Có tính câu điều khiển transaction; đây là số đo SQL thử nghiệm, không phải số bill Prisma thực tế hoặc cam kết tiết kiệm cho mọi lưu lượng. Chưa bao gồm lợi ích giảm polling quản trị/cache công khai. `npm run test:operations` bảo vệ ngân sách SQL của tình huống này và kiểm tra sửa giao dịch nguồn, phân loại thủ công, counters, heartbeat. Không cần Redis hoặc migration mới cho bản tối ưu này.

## Điều chuyển các phần hùn phước (01/11/2026)

Modal Điều chuyển có hai cách: nhập số tiền cần cắt, hoặc nhập tổng hùn phước muốn giữ lại ở nguồn (không phải số dư sau chi). Hệ thống lấy các khoản CREDIT/POSTED mới nhất trở ngược, chuyển trọn phần hoặc tách khoản cuối để đủ đúng từng đồng. Có thể chọn cả hai tài khoản hoặc giới hạn một tài khoản; mỗi phần vẫn thuộc tài khoản ngân hàng gốc và không được làm số dư khả dụng của nguồn trong tài khoản đó bị âm. Nếu lịch sử chỉ có số tổng mà thiếu giao dịch chi tiết thì phải nhập đủ chi tiết trước khi cắt phần đó.

REST `POST /api/admin/transfers/preview` trả toàn bộ kế hoạch, bản gốc/giữ lại/chuyển đi và fingerprint. `POST /api/admin/transfers/allocate` xác minh lại kế hoạch trong transaction Serializable; dữ liệu đổi thì yêu cầu xem trước lại. Request UUID chống gửi lặp. Ghi các phần, nhật ký chi tiết và ghi chú công khai theo lô trong cùng transaction. Modal chỉ đóng sau khi lưu thành công.

`FundAllocation` chỉ xuất hiện khi một giao dịch được chia cho nhiều thiện pháp; số tiền, nội dung, refId, tài khoản và dữ liệu gốc của `BankTransaction` không bị sửa bởi điều chuyển. Sổ thiện pháp và các trang giao dịch chiếu theo phần phân bổ; trang tất cả/thống kê ngày vẫn tính giao dịch ngân hàng gốc một lần. Các phần đã điều chuyển là MANUAL, không bị phân loại tự động lại. Có thể gán lại phần từ tab thiện pháp hoặc modal Xem giao dịch. Ghi chú gốc được dùng chung và che số điện thoại trên các trang công khai.

Bảng lịch sử có người thực hiện, thời gian, mức thành tựu, lý do và nút Xem các giao dịch; chi tiết `TransferItem` giữ snapshot tại lúc chuyển. Có thể đảo cả lượt khi các phần tiền và số dư vẫn còn đủ; lượt gốc và các ghi chú vẫn được giữ. Các bút toán cũ có mode BALANCE, không tự chuyển thành các giao dịch giả; mode ALLOCATION mới không được cộng/trừ thêm như bút toán số dư để tránh tính tiền hai lần.

Đồng bộ không thay lại phân loại thủ công. Nếu nguồn sửa số tiền của một khoản đã tách, các phần đã chuyển giữ cố định và phần còn lại ở thiện pháp gốc được điều chỉnh; nếu nguồn nhỏ hơn phần đã chuyển hoặc đổi chiều thì dừng trang đó, yêu cầu xử lý/đảo các điều chuyển trước. Đối chiếu Excel tự động mang theo các phần và chi tiết lịch sử sang giao dịch ngân hàng tương ứng.

Migration: `20261101010000_allocation_transfers`. Kiểm thử: `npm run test:allocation-transfers`, cùng bài REST `tests/allocation-transfers-http.mts` trên database QA riêng. Không dùng giao dịch thật để kiểm thử điều chuyển.

Số đếm tab giao dịch (Tất cả, Chưa phân loại và từng thiện pháp) tính toàn bộ lịch sử, không phụ thuộc bộ lọc; không tính bản đã gộp. Mặc định xem toàn bộ thời gian. Bộ lọc ngày/tìm kiếm/tài khoản chỉ giới hạn danh sách và số kết quả bên dưới, được giữ khi đổi tab; có nút Hôm nay, Toàn bộ thời gian, Xóa bộ lọc. Phân loại lại vẫn chỉ xử lý tab và bộ lọc hiện tại, giữ nguyên khoản gán thủ công.

Phiên Google SSO quản trị lưu tối đa 90 ngày thay vì 8 giờ. Cookie phiên do Auth.js quản lý; quyền ADMIN_EMAILS vẫn kiểm tra trên từng REST request/thao tác. Giữ AUTH_SECRET ổn định giữa các lần deploy để các phiên đang dùng không bị mất hiệu lực. Phiên cũ vẫn có hạn đã cấp trước đó; đăng nhập lại một lần để nhận thời hạn mới.

Bảo trì nhập Excel ban đầu (2026-11-01): đã xóa 267 BankTransaction origin BANK theo yêu cầu, giữ 12 thiện pháp; backup riêng tại ~/.codex/backups/hvntvn/. SyncLease bank-sync dùng token tiền tố excel-import-paused: với hạn 9999 để khóa cron trên mọi instance dùng cùng DB. Sau khi người dùng chốt mốc nhập Excel, cần đặt syncFrom cho cả hai tài khoản theo mốc chính xác, kiểm tra cursor/job rồi mới xóa riêng lease có tiền tố này để tiếp tục; không tự mở đồng bộ trong quá trình nhập. Có AuditLog BANK_TRANSACTIONS_RESET_FOR_EXCEL ghi số lượng và đường dẫn backup.

Mặc định tải Excel chỉ đọc các tab thuộc tháng mới nhất theo tên THÁNG n (giữ cả tab TK Mỹ/TK Trâm). Có thể bỏ chọn để đọc tất cả; file không đặt tên tab theo tháng vẫn đọc toàn bộ. Nếu tên tháng có năm thì so sánh năm/tháng; tên không có năm dùng năm Việt Nam hiện tại. Không tự chọn lùi tháng khi tháng mới nhất trống. Dòng chuyển số dư thiếu ngày được nhận diện riêng khi tab có tên THÁNG n; ngày đầu tháng là mốc số dư, không phải thời gian của một giao dịch ngân hàng.

Số dư chuyển sang tháng mới: lưu bản ghi Excel có entryStatus OPENING, không phải POSTED. Chỉ cộng vào số dư theo đúng thiện pháp/tài khoản, tách khỏi tổng hùn phước mới, tổng chi, phân loại lại và thống kê thu/chi hằng ngày. Theo yêu cầu quản trị, các dòng OPENING vẫn hiển thị và được đếm trong danh sách giao dịch (mỗi tài khoản một dòng), có nhãn số dư đầu tháng; count thống kê giao dịch thực tế vẫn tách riêng khỏi statementCount. Hiển thị riêng trong bảng thiện pháp, so sánh số dư và trang công khai. Import đối chiếu tổng nguồn bằng thu/chi chi tiết cộng số dư, có audit, giữ nguyên nguồn và người nhập; cấm hai số dư đầu kỳ cho cùng thiện pháp/tài khoản và cấm cộng số dư lên lịch sử có sẵn trước mốc đó. Migration 20261101020000_excel_opening_balances bổ sung ràng buộc và unique index theo fund/account cho OPENING.

Đã nhập từ Google Sheet 1do6zEDP7wQU803U9oZVIwdYFGp9Nyeo-3sHump6LJB0 theo lựa chọn của quản trị: chỉ THÁNG 11- TK Trâm và THÁNG 11- TK My, BATCOMTHIENPHAP; TK 0856 = 14.885.773 VND, TK 0572 = 14.365.000 VND, tổng số dư = 29.250.773 VND tại 00:00 01/11/2026 giờ Việt Nam. Hai bản ghi OPENING, không có POSTED mới; giữ nguyên khóa đồng bộ excel-import-paused. Nguồn XLSX đã sao lưu tại ~/.codex/backups/hvntvn/imports/, audit SOURCE_SPREADSHEET_IMPORTED lưu link, fileHash và importIds. Kiểm thử: tests/opening-import-integration.mts (DB QA riêng), test:excel-integration, test:allocation-transfers và test:integration; đã xác nhận REST công khai và HTML hiển thị số dư riêng.

Hiển thị số dư chuyển sang như giao dịch: bảng quản trị, modal giao dịch thiện pháp, trang chi tiết công khai và tìm kiếm Minh bạch đều bao gồm OPENING. Badge tab và số kết quả tính cả các dòng này. Giữ nguyên tính số dư một lần và không đổi dữ liệu nguồn; không tự động phân loại lại hay bulk gán dòng số dư gốc. Public directory dùng statementIncomeCount/statementExpenseCount để phân trang và tìm kiếm đủ cả các dòng số dư.

Số dư chuyển sang có thể âm trong cột Tiền vào của Excel: parser chỉ cho số âm với dòng số dư, lưu dấu gốc của cột trong source.openingCredit/openingDebit và biểu diễn thành OPENING/DEBIT với amount dương; không ghi thành chi phí mới. Tổng nguồn được đối chiếu theo đúng cột gốc. Đã nhập ANTONG từ sheet 17ou0OAatD0oI4gvqixBuNQRqkGRcVpKc6SxLN0TAwU0: chỉ THÁNG 11- TK My, TK 0572, số dư âm 11.579.561 VND, một dòng OPENING tại 00:00 01/11/2026 giờ Việt Nam. Giữ khóa sync, backup và audit SOURCE_SPREADSHEET_IMPORTED.

Theo yêu cầu tiếp theo của quản trị, đã gỡ riêng dòng OPENING âm 11.579.561 VND của ANTONG; batch tháng 11 tương ứng chuyển CANCELLED và có errors giải thích để không tự nhập lại. Giữ file/data/audit, thêm FUND_OPENING_BALANCE_REMOVED và backup trước khi gỡ. ANTONG hiện 0 VND, không có dòng số dư; BATCOMTHIENPHAP vẫn 29.250.773 VND (hai tài khoản), khóa đồng bộ giữ nguyên. Chưa chuyển số âm sang cho tới khi có chỉ dẫn mới.

Đã nhập theo xác nhận rõ của quản trị vào HTTB (không phải TTTS dù tiêu đề nguồn ghi Trai tăng): Google Sheet 1K32uoI01lzvTrrc0u5LL9KSVbjbee-GRIguZzKLLIr4, chỉ TK My- THÁNG 11, số dư 8.061.727 VND, một dòng OPENING/CREDIT tại 00:00 01/11/2026 giờ Việt Nam ở TK 0572. Audit SOURCE_SPREADSHEET_IMPORTED lưu cả tiêu đề nguồn và lựa chọn HTTB đã xác nhận. Các thiện pháp khác không thay đổi; khóa đồng bộ vẫn giữ.

Đã gộp/xóa TTTS theo yêu cầu quản trị: TTTS không có giao dịch, import, allocation hay điều chuyển; backup đầy đủ trước khi xóa, giữ audit cũ và thêm FUND_DELETED_MERGED_INTO_HTTB. HTTB nhận các từ khóa TTTS, TRAI TANG, DAT BAT, TU SU (đã validate không trùng); FUND_UPDATED ghi trước/sau để xem trong lịch sử cấu hình. Giữ trạng thái công khai/ghim hiện có của HTTB. Bổ sung số dư TK Trâm 0856 từ tab TK Trâm trong nguồn 1K32uoI01lzvTrrc0u5LL9KSVbjbee-GRIguZzKLLIr4: đối chiếu đủ 10 giao dịch cũ, thu 1.564.000, chi 0, tạo một OPENING/CREDIT đầu 11/2026; không nhập lại 10 giao dịch cũ. HTTB tổng 9.625.727 VND = Mỹ 8.061.727 + Trâm 1.564.000. Không thay Bát Cơm hay khoản âm Ấn Tống đã gỡ; khóa sync giữ nguyên.

Đọc file tháng mới nhất giữ thêm tab độc lập có tên TK Mỹ/TK Trâm cho tài khoản chưa có tab tháng mới nhất. Ưu tiên tài khoản trong tên tab thay vì tiêu đề mẫu bị copy sai. Chỉ tổng hợp tab độc lập thành số dư đầu tháng nếu tất cả giao dịch trước mốc đầu tháng mới và tổng chi tiết khớp dòng tổng; nếu có giao dịch trong kỳ hoặc số liệu không khớp thì báo lỗi, không tự cộng.

Quy tắc tổng hợp mới theo yêu cầu quản trị (thay cho cách tách số dư trước đó): các khoản Excel OPENING/CREDIT được tính vào Hùn phước, OPENING/DEBIT vào Đã chi; không cộng openingBalance thêm lần nữa khi tính Số dư. Cùng cách tính ở fundTotals, byAccount, accountTotals, bảng quản trị, so sánh phân bổ và trang công khai; giữ metadata nguồn để tra cứu và giữ cơ chế chống nhập trùng. Thống kê giao dịch ngân hàng mới theo ngày vẫn chỉ lấy POSTED, không coi khoản lịch sử nhập đầu tháng là chuyển khoản mới từ ngân hàng. Các bút toán điều chuyển lịch sử BALANCE vẫn giữ nguyên, không xóa/ghi lại dữ liệu tiền. Bát Cơm: hùn phước/số dư 29.250.773; HTTB: hùn phước/số dư 9.625.727; đã chi cả hai = 0; ANTONG vẫn 0 và chưa chuyển số âm.

Đã nhập TP63 theo yêu cầu chỉ lấy Quỹ H3, không nhập lịch sử hay số m²: nguồn 1rA6bDTJrzxIS19v1n2vffjejaa_TkhzCdQTlsnVfbLY; tab TP63- TK MY: 21.902.671 VND (F3 817.727.671 − E3 795.825.000), tab TK TRÂM: 200.000 VND (F3 200.000 − E3 0). Hai dòng OPENING/CREDIT được tính vào Hùn phước; tổng thu/số dư TP63 22.102.671 VND, chi hệ thống 0, không cộng lại chi lịch sử đã trừ trong Quỹ. Backup nguồn XLSX, audit SOURCE_SPREADSHEET_IMPORTED_QUY_ONLY lưu sourceCell H3 và các tổng nguồn. Giữ khóa đồng bộ.

Đã nhập Quỹ TP97 từ nguồn 1OHiH1pWnDDYf8O8GefbHaZvj38yUU9ism_K4ml_lKI8, theo cùng cách Quỹ-only: tab TP97- TK My, H3 = 103.447.948 VND (F3 173.447.948 − E3 70.000.000), tab TK Trâm, H3 = 210.000 VND (F3 210.000 − E3 0). Hai OPENING/CREDIT tính vào Hùn phước, tổng 103.657.948 VND, đã chi hệ thống 0, số dư 103.657.948 VND. Không nhập lại chi lịch sử 70 triệu đã trừ trong số Quỹ; không đổi các thiện pháp khác; sync vẫn tạm khóa. Backup XLSX và audit SOURCE_SPREADSHEET_IMPORTED_QUY_ONLY giữ chi tiết ô nguồn.

Theo yêu cầu mới, TP97 đã thay hoàn toàn hai dòng tổng Quỹ bằng 571 giao dịch chi tiết từ cùng XLSX, trong một transaction atomic: TK Mỹ 568 dòng (thu 173.447.948, chi 70.000.000), TK Trâm 3 dòng (thu 210.000, chi 0). Tổng hùn phước TP97 = 173.657.948, chi = 70.000.000, số dư vẫn = 103.657.948 VND. Hai batch tổng cũ được đổi tên/đánh dấu CANCELLED, giữ nguồn và audit; hai batch chi tiết dùng lại khóa fileHash+sheetName gốc để tải lại không nhập trùng. Audit TP97_SUMMARY_REPLACED_WITH_DETAIL giữ backup và ID dòng tổng cũ; các thiện pháp khác không đổi; sync vẫn khóa.

Excel chi tiết giữ đầy đủ ghi chú nguồn. Hai dòng TP97- TK My số 33 (175.611 từ TP100) và 58 (27.161.812 từ TP73) không có ngày trong file. Parser chỉ cho phép thiếu ngày với nội dung rõ dạng chuyển số dư từ TP; source.dateUnknown và note kind SOURCE_DATE_MISSING đánh dấu, lưu timestamp kỹ thuật để đáp ứng schema nhưng mọi bảng quản trị/công khai hiển thị “Chưa có ngày trong Excel”. Không dùng timestamp kỹ thuật này để lọc ngày, thống kê theo ngày, tìm theo ngày hoặc tự đối chiếu giao dịch ngân hàng. Các dòng thiếu ngày khác vẫn báo lỗi. 24 ghi chú gốc đã giữ. Kiểm thử: fund-excel.test.ts, undated-excel-integration.mts, test:excel-integration và test:transaction-summary trên DB QA riêng.

TP63 cũng đã thay hai dòng tổng Quỹ bằng toàn bộ giao dịch chi tiết, atomic theo yêu cầu mới: TK Mỹ 865 dòng (858 thu, 7 chi), TK Trâm 1 dòng thu; tổng 866 dòng, 859 khoản thu = 817.927.671 VND, 7 khoản chi = 795.825.000 VND, số dư vẫn 22.102.671 VND. Các dòng chi tiết khớp toàn bộ tổng nguồn, không có dòng thiếu ngày; 57 ghi chú được giữ. Không nhập tab Danh sách thí chủ 1 cổ phần vì tổng hợp trùng giao dịch thu. Hai batch tổng cũ CANCELLED/đổi tên, hai batch chi tiết dùng fileHash+sheetName gốc để chống tải lại trùng. Audit TP63_SUMMARY_REPLACED_WITH_DETAIL và backup giữ mọi ID cũ, nguồn XLSX. Không đổi các thiện pháp khác, sync vẫn khóa.

Đã nhập toàn bộ chi tiết TP112 từ nguồn 1OFclq0bxBv1GGzaWXKatuksOBlbez6k-VRsV5K2j5-c: TK Mỹ 1.170 dòng (1.163 thu, 7 chi), TK Trâm 5 dòng thu; tổng 1.175 dòng, 1.168 khoản thu = 565.627.253 VND, chi = 387.500.000, số dư = 178.127.253. Theo tài khoản: Mỹ thu 553.976.365, chi 387.500.000, dư 166.476.365; Trâm thu/dư 11.650.888. Không dòng thiếu ngày, không ghi chú gốc G; nhập atomic, 2 batch COMPLETE, all MANUAL, nguồn XLSX backup và audit TP112_FULL_DETAIL_IMPORTED. Không đổi tiền/số giao dịch các thiện pháp khác, khóa sync giữ nguyên.

Lưu ý đối chiếu phần phân bổ từ Excel: TP112 dòng 604 và TP97 dòng 354 cùng narrative FT26290410165213, mỗi sổ ghi 100.000 VND. Đã kiểm tra API Thiện Nguyện 16–18/10/2026: giao dịch gốc id 2111291064110329856, refId nguồn FT26290066700734, 17/10/2026 09:59, giá trị 300.000 VND, narrative “Kathina TP97 112 … k2B87RDF/466xxx”. Đây là phần 100.000 cho mỗi thiện pháp, không tự gộp/xóa 100.000 TP97. Thêm note ALLOCATION_SOURCE trên cả hai dòng và giữ bằng chứng API trong audit. Các bản ghi Excel có cùng mã trong nội dung có thể là các phần phân bổ, không được coi là trùng tiền chỉ dựa vào mã.

Hiển thị thiếu quỹ: số dư signed trong ledger vẫn nguyên vẹn để điều chuyển/đối chiếu không sai. Mỗi thiện pháp và mỗi phần theo tài khoản trả thêm availableBalance=max(balance,0), excessExpense=max(-balance,0). Bảng quản trị, footer theo bộ lọc, trang công khai chi tiết và danh mục hiển thị “Số dư khả dụng” và “Chi vượt quỹ” (số dương, màu đỏ khi >0). Tổng thực theo sổ = tổng khả dụng của các thiện pháp − tổng chi vượt quỹ; chính tổng thực signed được so với số dư Thiện Nguyện. Phân rã theo tài khoản được tính theo từng phần thiện pháp/tài khoản, không làm mất bù trừ giữa tài khoản trong cùng thiện pháp. Không đổi bất kỳ giao dịch, nhập lại khoản âm Ấn Tống hay thay công thức ledger signed; vẫn giữ các điều chuyển lịch sử. Tests balance-summary.test.ts và balance-summary-integration.mts kiểm tra số âm, 0, BigInt lớn, tổng thực và chi vượt giữa hai tài khoản; allocation transfer regression vẫn qua.

Đã nhập toàn bộ chi tiết TP54 từ nguồn 1LwezmcsVGGR70bxl-ZKd5uLfFZDRMl0C8aX9k88FGeA: TK Trâm 273 dòng (231 thu, 42 chi), TK Mỹ 22 dòng thu; tổng 295 dòng, thu 213.740.956 VND (Trâm 204.982.956 + Mỹ 8.758.000), chi 415.804.190 VND. Ledger signed = -202.063.234, giao diện khả dụng = 0, chi vượt quỹ = 202.063.234; không bỏ chi và không cộng khoản thiếu vào tổng khả dụng. Tại thời điểm nhập: tổng khả dụng các thiện pháp 342.764.372, tổng chi vượt 202.063.234, số dư thực theo sổ 140.701.138. Các thiện pháp khác không đổi; ANTONG vẫn chưa nhập lại khoản âm. Source backup và audit TP54_FULL_DETAIL_IMPORTED, 2 batch COMPLETE, all MANUAL; khóa sync giữ nguyên.

Giữ 85 ghi chú gốc TP54. Dòng 276 của tab TP54- TK Trâm “Điều chuyển số dư từ TP121- Rạp che sang”, 3.967.828 VND, không có ngày: nhập như điều chuyển nội bộ thiếu ngày, note SOURCE_DATE_MISSING, không phải số dư đầu tháng. Parser ưu tiên nhận dạng (Điều) chuyển số dư từ TP trước nhánh số dư tháng; unit test đã bổ sung.

### Mốc đồng bộ ngân hàng từ 01/11/2026

- Mọi lượt webhook, quét nhanh, quét toàn ngày, quét ngày trước và quét bù lịch sử đều bị giới hạn từ **00:00 ngày 01/11/2026 (Asia/Ho_Chi_Minh)**, tương đương `2026-10-31T17:00:00.000Z`. Đây là mốc cố định, không dịch chuyển theo ngày chạy cron.
- API nguồn không được yêu cầu khoảng trước mốc; bộ ghi giao dịch BANK tiếp tục chặn bản ghi trước mốc kể cả nguồn trả nhầm. Job cũ trước mốc bị bỏ qua; job giao khoảng được đặt lại trang đầu.
- Giao dịch lịch sử được nhập riêng từ Excel; giới hạn trên không áp dụng cho nhập Excel. Hai tài khoản 0572/0856 dùng chung mốc này.
- Đã triển khai production và mở lại lease đồng bộ ngày 01/11/2026. Lượt kiểm tra đầu nhận 61 giao dịch từ mốc trở đi, không có giao dịch BANK trước mốc; 2.911 bản ghi Excel giữ nguyên (đã đối chiếu hash).

### TP121 — nhập chi tiết Excel ngày 01/11/2026

- Nguồn: https://docs.google.com/spreadsheets/d/1E4akqwCyNYUKBD7eg4rrvwA_FuRwEi50bq4I65C4mOI/edit ; nhập 111 giao dịch POSTED/MANUAL, không dùng số dư tổng hợp.
- TK Trâm: 105 dòng, thu 21.967.628₫, chi 3.967.628₫. TK Mỹ: 6 dòng, thu 510.000₫, chi 18.000.000₫. Tổng thu 22.477.628₫, chi 21.967.628₫, còn 510.000₫.
- Dòng 108 của TK Trâm “Điều chuyển số dư về TP54” không có ngày: giữ dấu SOURCE_DATE_MISSING, không tự đặt ngày nghiệp vụ. TP121 ghi 3.967.628₫ trong khi TP54 ghi 3.967.828₫; ghi chú công khai chênh lệch 200₫, giữ nguyên TP54 để quản trị viên kiểm tra.
- Tạo TP121 với từ khóa RAPCHE, mặc định chưa đưa vào danh sách công khai tổng hợp. Lưu file nguồn riêng tư và audit TP121_FULL_DETAIL_IMPORTED; kiểm tra trùng chính xác trước nhập.

### TP120 — nhập chi tiết Excel ngày 01/11/2026

- Nguồn: https://docs.google.com/spreadsheets/d/1FqxRPfii-fCWyWGZevYDOGx3Mj4SFypmrcm7yjsA0PA/edit ; chỉ có tab TP120- TK My.
- Nhập 191 dòng POSTED/MANUAL (190 thu, 1 chi), thu 50.297.400₫, chi 32.000.000₫, còn 18.297.400₫; giữ 5 ghi chú nguồn, không phát hiện trùng chính xác với lịch sử đã có.
- Giữ nguyên 4 khoản BANK tự đồng bộ từ 01/11 tổng 1.450.000₫. Sau nhập: hùn phước 51.747.400₫, chi 32.000.000₫, số dư 19.747.400₫ (195 giao dịch).
- Giữ nguyên tên, từ khóa, trạng thái, công khai và danh tính người tạo/cập nhật thiện pháp. File nguồn và dữ liệu trước nhập được sao lưu riêng tư; audit TP120_FULL_DETAIL_IMPORTED.

### KATHINA2 — nhập chi tiết Kathina02 ngày 01/11/2026

- Nguồn: https://docs.google.com/spreadsheets/d/1VofElEuqZvQxypj-LlrcHX6p7CldC2XN2A1EO4NgFAA/edit ; tab Kathina02- TK My, 136 dòng POSTED/MANUAL (135 thu, 1 chi).
- Thu 29.254.302₫, chi 143.250.000₫, khả dụng 0₫, chi vượt 113.995.698₫; giữ số dư có dấu để cộng quỹ chính xác.
- Dòng 4 điều chuyển từ Kathina01 sang 6.194.353₫ chưa có ngày: giữ SOURCE_DATE_MISSING, không suy đoán ngày nghiệp vụ. Giữ 9 ghi chú nguồn; không có trùng chính xác trước nhập.
- Giữ nguyên cấu hình thiện pháp mã KATHINA2. Sao lưu nguồn và dữ liệu trước nhập riêng tư; audit KATHINA2_FULL_DETAIL_IMPORTED.

### Phạm vi riêng của HTTB và PSCD

- HTTB chỉ ghi nhận TK Mỹ 0572; PSCD chỉ ghi nhận TK Trâm 0856. Hai thiện pháp có accountIds rỗng và accountId trỏ đúng tài khoản được phép; các thiện pháp khác tiếp tục dùng chung.
- Sửa cấu hình thiện pháp giữ nguyên phạm vi đã cấu hình, không tự mở lại cả hai tài khoản. Form hiển thị tài khoản thực tế được phép, không cho chọn. Import Excel trái tài khoản của quỹ một tài khoản bị chặn; phân loại, gán tay và điều chuyển dùng chung kiểm tra fundUsesAccount.
- Cấu hình đã cập nhật có audit FUND_UPDATED và sao lưu riêng tư. Khoản Excel HTTB 1.564.000₫ ở TK Trâm được giữ nguyên chờ quản trị viên quyết định xử lý, không tự thay đổi tiền đã nhập.

### HTTB — thay nguồn sai bằng file chuẩn ngày 01/11/2026

- Theo yêu cầu quản trị, nguồn chuẩn là https://docs.google.com/spreadsheets/d/1aNOFIqneUEoIf3Uvx3y344vg5W9vYjpMT0AiaIjEK3U/edit?gid=2039646716 ; tab THÁNG 11, TK Mỹ 0572, dòng 4 chuyển số dư tháng 10: 71.309.382₫, khớp tổng F3/H3, chi 0₫.
- Đã thay hai OPENING từ nguồn cũ nhập nhầm (Mỹ 8.061.727₫ và Trâm 1.564.000₫) bằng một OPENING/CREDIT 71.309.382₫ tại đầu tháng 11 giờ Việt Nam. Hai batch cũ CANCELLED và giữ nguyên dữ liệu nguồn để tra cứu; batch chuẩn COMPLETE, chống nhập trùng theo fileHash + sheetName. Nội dung này thay thế số dư HTTB ghi ở các mục lịch sử phía trên.
- Không nhập cộng các tab tháng 8–10 vì đã nằm trong số dư chuyển sang. HTTB sau thay: hùn phước/số dư 71.309.382₫, chi 0₫, chỉ TK Mỹ. Giữ cấu hình quỹ, từ khóa, quyền công khai/ghim và danh tính người cập nhật.
- Sao lưu XLSX và dữ liệu trước/sau riêng tư, audit HTTB_WRONG_SOURCE_REPLACED_WITH_STANDARD. Thay atomic trong transaction Serializable; kiểm tra hash xác nhận mọi giao dịch ngoài hai dòng cũ và tổng các quỹ khác không đổi.

### Link Excel nguồn của thiện pháp

- Mỗi thiện pháp có `sourceUrl` riêng, chỉnh trong Cấu hình và lưu qua REST API hiện có. Link **Excel nguồn** nằm trong cột riêng cuối bảng, sau Người cập nhật, dùng kiểu nút phụ nhỏ và mở tab mới; chỉ xuất hiện trong quản trị, không thêm vào dữ liệu trang công khai. Nút Nhập Excel đã gỡ khỏi cột Thao tác theo yêu cầu; quỹ chưa có link nguồn hiển thị dấu —. Backend chỉ nhận URL HTTP/HTTPS hoặc trống, ghi thay đổi trong lịch sử cấu hình.
- Đã gắn link từ nhật ký nhập cho ANTONG, BATCOMTHIENPHAP, HTTB, KATHINA2, TP54, TP63, TP97, TP112, TP120, TP121. HTTB trỏ file chuẩn mới nhất; file Trai tăng/Đặt bát/Dâng tứ sự trước đây gán nhầm HTTB nay gắn vào TDTS để tra cứu. Các thiện pháp chưa xác định nguồn giữ trống; không thay đổi dữ liệu tiền.

### Xóa lượt tự đồng bộ ngày 01/11/2026 theo yêu cầu quản trị

- Đã sao lưu rồi xóa 61 giao dịch BANK được nhập trong ngày 01/11 giờ Việt Nam (14 TK Mỹ, 47 TK Trâm), cùng 6 ghi chú phụ thuộc; không có allocation, điều chuyển hay giao dịch Excel gộp phụ thuộc. Kiểm tra hash trong transaction Serializable xác nhận mọi giao dịch còn lại, gồm toàn bộ Excel, giữ nguyên.
- Audit TODAY_AUTO_BANK_TRANSACTIONS_REMOVED lưu danh sách ID, backup và phạm vi. Giữ lịch sử lần đồng bộ cũ để tra cứu; số inserted trong lịch sử là kết quả lúc chạy, không phải số giao dịch còn tồn tại.
- Đặt lại khóa `bank-sync` với token `excel-import-paused:user-request-remove-bank-20261101:*` để chặn webhook nhập lại khi người dùng đang tắt cron. Chỉ mở khóa khi quản trị yêu cầu bật đồng bộ trở lại; deploy code không tự xóa khóa này.

### SK — Tủ thuốc Tăng đoàn, nhập nguồn ngày 01/11/2026

- Nguồn: https://docs.google.com/spreadsheets/d/1hNxL-TdfR2uj6nkrQC7nKQ0SmcTwE3xYj4UXXcQCT4A/edit ; tab THÁNG 11, TK Trâm 0856, dòng 4 chuyển từ tháng 10: 1.920.000₫. Đối chiếu tháng 9 thu 520.000₫ và tháng 10 thu thêm 1.400.000₫, không chi, khớp số dư tháng 11.
- Nhập một OPENING/CREDIT tại đầu tháng 11 giờ Việt Nam, không cộng lại lịch sử tháng 9–10. Hùn phước/số dư SK = 1.920.000₫, chi 0₫. Gắn sourceUrl để mở Excel nguồn trong menu thao tác phụ; giữ nguyên cấu hình và phạm vi tài khoản hiện có của quỹ.
- Backup nguồn và dữ liệu trước/sau riêng tư, audit SK_SOURCE_SPREADSHEET_IMPORTED; transaction Serializable kiểm tra mọi giao dịch trước đó và tổng các quỹ khác không đổi. Khóa đồng bộ ngân hàng giữ nguyên; không gọi API lấy giao dịch ngân hàng.

### HOCBONG — Học bổng Tăng đoàn, nhập nguồn ngày 01/11/2026

- Nguồn: https://docs.google.com/spreadsheets/d/1_XhwB1qnInaMls5noUDXiSXD0atCmw6h0qo6fhWpzIw/edit ; tab THÁNG 11- TK My, TK Mỹ 0572, dòng 4 số dư âm 9.784.000₫. Đối chiếu tháng 8 thu 3.368.000₫, tháng 9 thu 1.380.000₫/chi 16.000.000₫, tháng 10 thu 1.468.000₫: khớp số âm chuyển tháng 11.
- Nhập một OPENING/DEBIT 9.784.000₫ đầu tháng 11 giờ Việt Nam, giữ openingCredit âm trong metadata nguồn, không cộng lại lịch sử tháng 8–10. Số dư signed -9.784.000₫, khả dụng 0₫, chi vượt quỹ 9.784.000₫. Gắn link Excel nguồn; cấu hình quỹ giữ nguyên.
- Backup XLSX và trước/sau riêng tư; audit HOCBONG_SOURCE_SPREADSHEET_IMPORTED. Transaction Serializable xác nhận mọi giao dịch cũ và tổng các quỹ khác không đổi; khóa đồng bộ ngân hàng giữ nguyên.

Tủ thuốc SK đã giới hạn riêng TK Trâm 0856 theo yêu cầu quản trị: accountId = TK 0856, accountIds rỗng; giữ slug cũ để link công khai tiếp tục hoạt động. Đã kiểm tra không có giao dịch/phân bổ trái tài khoản, sao lưu cấu hình và ghi audit FUND_UPDATED; số dư 1.920.000₫ giữ nguyên.

### ANTONG — nhập lại theo yêu cầu mới ngày 01/11/2026

- Quản trị gửi lại nguồn https://docs.google.com/spreadsheets/d/17ou0OAatD0oI4gvqixBuNQRqkGRcVpKc6SxLN0TAwU0/edit để nhập Ấn Tống, thay cho quyết định tạm gỡ trước đó. Tab THÁNG 11- TK My, TK Mỹ 0572, số dư âm 11.579.561₫; đối chiếu tháng 8 thu 8.733.295₫, tháng 9 thu 22.892.790₫/chi 78.600.000₫, tháng 10 thu 35.394.354₫: khớp số dư chuyển tháng 11.
- Tạo một OPENING/DEBIT 11.579.561₫ đầu tháng 11, giữ dấu âm nguồn trong openingCredit; khả dụng 0₫, chi vượt quỹ 11.579.561₫. Không cộng lại lịch sử tháng 8–10. Batch cũ vẫn CANCELLED, batch mới COMPLETE; sourceUrl gắn nguồn mới gửi.
- Backup XLSX và dữ liệu trước/sau riêng tư, audit ANTONG_SOURCE_SPREADSHEET_IMPORTED. Đã kiểm tra trong transaction Serializable mọi giao dịch trước đó và tổng quỹ khác không đổi; khóa đồng bộ ngân hàng giữ nguyên.

### PSCD — quỹ dài hạn, chỉ số dư TK Trâm 0856

- Nguồn: https://docs.google.com/spreadsheets/d/1oa7wh6xP4Iyz6FcWgot99WEnF8nzx2mRbur9lXvb7KE/edit ; theo yêu cầu quản trị chỉ nhập số dư, không nhập chi tiết giao dịch. Tab THÁNG 11 dòng 4 là 86.244.741₫, khớp tổng tháng 10: 90.051.677₫ − 3.806.936₫.
- Một OPENING/CREDIT đầu tháng 11 giờ Việt Nam; hùn phước/số dư 86.244.741₫, chi hệ thống 0₫. Giữ accountId TK Trâm 0856, accountIds rỗng; không ghi nhận TK Mỹ. Link Excel nguồn đã gắn.
- Backup XLSX và trước/sau riêng tư, audit PSCD_SOURCE_SPREADSHEET_IMPORTED; kiểm tra transaction Serializable không đổi giao dịch cũ và tổng các quỹ khác. Khóa đồng bộ ngân hàng giữ nguyên.

### DTS / TDTS — Trai tăng, Đặt bát, Dâng tứ sự

- Nguồn https://docs.google.com/spreadsheets/d/1K32uoI01lzvTrrc0u5LL9KSVbjbee-GRIguZzKLLIr4/edit ; quản trị xác nhận nhập cả TK Mỹ 0572 (8.061.727₫, tab TK My- THÁNG 11) và TK Trâm 0856 (1.564.000₫, tổng hợp 10 giao dịch cũ của tab TK Trâm), tổng 9.625.727₫.
- Nhập hai OPENING/CREDIT đầu tháng 11 vào quỹ cùng tên hiện có mã TDTS; không tạo quỹ trùng hoặc đổi mã/slug. Giữ chú thích nguồn của TK Trâm, link Excel nguồn và cấu hình hiện có. Không nhập cộng lịch sử tháng cũ; HTTB không thay đổi.
- Backup riêng tư, audit TDTS_SOURCE_SPREADSHEET_IMPORTED lưu xác nhận hai tài khoản. Kiểm tra trong transaction Serializable mọi giao dịch cũ và tổng quỹ khác không đổi; đồng bộ ngân hàng vẫn khóa.

### Phân loại luôn theo tài khoản thực nhận

- Gán tay từng dòng/hàng loạt, gán trong Xem giao dịch, đối soát và điều chuyển phần phân bổ đều kiểm tra tài khoản của giao dịch thuộc phạm vi thiện pháp nhận. Danh sách chọn gán tay chỉ hiện thiện pháp hỗ trợ toàn bộ tài khoản của các dòng đang chọn; backend tiếp tục chặn nếu gửi yêu cầu không hợp lệ. Không sửa tài khoản hay số tiền nguồn khi phân loại.
- Đồng bộ đọc quy tắc của mọi thiện pháp để phát hiện mã/từ khóa đúng nhưng chuyển vào tài khoản ngoài phạm vi. Trường hợp này giữ UNASSIGNED, reason bắt đầu `Sai tài khoản nhận:`, hiển thị cảnh báo ở cột Phân loại để quản trị gán vào thiện pháp cùng tài khoản. Không tự chuyển sang thiện pháp khác qua từ khóa dự phòng khi nội dung có mã sai tài khoản.
- Chạy lại phân loại cũng lưu cảnh báo cho giao dịch vốn chưa phân loại; các khoản đã gán MANUAL vẫn được bảo vệ. Kiểm thử domain và integration trên database localhost riêng: nhận diện sai tài khoản ở luồng ingest, chặn gán tay khác tài khoản, giữ nguyên tiền và tài khoản khi gán hợp lệ, regression phân loại lại/hàng loạt. Không mở khóa đồng bộ production.

### TP122 — nhập chi tiết ngày 01/11/2026

- Nguồn https://docs.google.com/spreadsheets/d/170UnDEIqZxiD0-W7D0YdA8Nt1hKHZoQG3kAg3xotLR0/edit?gid=0 ; nhập 165 giao dịch POSTED/MANUAL, đều là thu: tab TP122- TK Trâm có 163 dòng/97.695.148₫, tab TK My có 2 dòng/600.000₫. Tổng thu/số dư 98.295.148₫, chi 0₫. Tên tab TK My xác định tài khoản 0572 dù tiêu đề mẫu sao chép ghi TK Trâm.
- Đối chiếu khớp tổng từng tab, không có dòng lỗi/thiếu ngày, giữ 6 ghi chú nguồn và kiểm tra trùng chính xác trước nhập. Gắn sourceUrl, giữ cấu hình/quyền công khai và danh tính người cập nhật của thiện pháp.
- Backup XLSX và trước/sau riêng tư, audit TP122_FULL_DETAIL_IMPORTED; nhập atomic Serializable, xác nhận hash mọi giao dịch trước đó và tổng các quỹ khác không đổi. Không thay khóa đồng bộ ngân hàng.

### Mục tiêu thành tựu của thiện pháp

- Trường `goalAmount` tùy chọn, nhập trong Cấu hình bằng số nguyên VND lớn hơn 0, tối đa 15 chữ số; để trống để bỏ mục tiêu. Lưu qua REST API hiện có, kiểm tra quyền và nguồn yêu cầu như các cấu hình khác. Mục tiêu thành tựu hiển thị dưới tên thiện pháp, có nhãn riêng, chỉ hiện khi đã đặt; số này độc lập với tiền và trạng thái hoạt động của quỹ.
- Thay đổi mục tiêu được ghi lịch sử cấu hình, biểu diễn số tiền chính xác bằng BigInt và audit bằng chuỗi VND. Form cũ không gửi trường này vẫn giữ mục tiêu hiện tại. Các quỹ hiện có mặc định chưa có mục tiêu, không suy đoán từ mô tả hoặc file Excel.
- `tests/fund-goal-http.mts` kiểm tra REST tạo/sửa/xóa, số lớn, dữ liệu sai, tương thích form cũ, audit và ledger giữ nguyên trên database QA riêng.

### Ghi chú nội bộ theo thiện pháp

- `adminNote` là ghi chú riêng trong quản trị, tối đa 3.000 ký tự, chỉnh ở Cấu hình và hiển thị dưới tên thiện pháp cùng khu vực thông tin mục tiêu, tách khỏi các cột thu/chi/số dư. Giữ xuống dòng, nội dung được render như văn bản; không đưa vào trang hoặc REST API công khai. Độc lập với mô tả công khai và các ghi chú giao dịch.
- Lưu qua REST hiện có, ghi FUND_UPDATED/FUND_CREATED; form cũ không gửi adminNote vẫn giữ ghi chú hiện tại, gửi chuỗi trống để xóa. Quỹ cũ mặc định trống. Kiểm thử HTTP trên database QA riêng gồm lưu nhiều dòng, giới hạn độ dài, giữ ghi chú qua form cũ, xóa và kiểm tra không lộ ở API công khai.

### Gỡ danh mục Minh bạch theo yêu cầu quản trị

- Đã gỡ trang tổng hợp `/minh-bach`, lối vào cũ `/t` và endpoint danh mục `/api/public/funds`; giữ trang công khai từng thiện pháp `/t/[slug]` và REST chi tiết `/api/public/funds/[slug]`. Không còn liên kết quay về danh mục từ trang chi tiết.
- Danh sách quản trị không còn nút Trang tổng hợp công khai hoặc icon mắt. Nút Trang công khai của từng thiện pháp dùng viền mảnh, nền trong suốt và chữ nhỏ nhẹ. Dữ liệu giao dịch và cấu hình công khai cũ giữ nguyên.

### Tốc độ trang công khai

- `/t/[slug]` dùng HTML ISR tạo theo nhu cầu, revalidate 30 giây; cache số liệu/chi tiết 30 giây, cập nhật nền khi cron có giao dịch mới. Tải lần đầu không chờ dựng lại toàn bộ trang khi cache còn dùng được. Lần đầu chưa có cache vẫn cần truy vấn dữ liệu; các chỉnh sửa quản trị tiếp tục vô hiệu hóa cache ngay.
- HTML mặc định có sẵn tổng và 100 dòng hùn phước đầu tiên; tham số tìm kiếm/chi/trang của URL áp dụng qua REST sau hydration. History API cùng sự kiện public:navigate giữ chuyển tab, phân trang, tìm kiếm, Back/Forward phía client, không dùng điều hướng RSC hay reload. Không dùng useSearchParams để tránh làm mất SSR nội dung trong trang tĩnh.
- Tiêu đề chỉ đọc danh tính thiện pháp; tổng tiền dùng cùng fundTotals với phạm vi một fundId, giữ nguyên công thức allocations, số dư đầu kỳ và điều chuyển. Không tính lại tất cả quỹ chỉ để mở một trang chi tiết.
- `tests/public-cache-http.mts` kiểm tra HTML có dữ liệu SSR và cache HIT, số liệu phạm vi một quỹ khớp tính toàn sổ, lọc/chi/phân trang/tìm kiếm, che thông tin riêng và cache mới sau điều chỉnh phân bổ. Đã kiểm tra trực tiếp trên trình duyệt URL bộ lọc, xóa tìm kiếm và Back/Forward.

### Vercel Web Analytics

- Tích hợp `@vercel/analytics/next` trong root layout qua SiteAnalytics; Suspense riêng cho analytics giữ trang công khai tiếp tục xuất HTML ISR. Ghi nhận lượt truy cập trang, không gửi custom events hoặc dữ liệu giao dịch.
- beforeSend loại toàn bộ query string và hash khỏi URL để không ghi nhận nội dung tìm kiếm, bộ lọc hay tham số đăng nhập trong analytics. Xem lượt truy cập tại Vercel → dự án → Analytics; dữ liệu bắt đầu từ khi bản tích hợp được triển khai.

### Mở lại đồng bộ ngân hàng từ 00:00 ngày 01/11/2026

- Theo yêu cầu quản trị, cho phép đồng bộ tự động lấy các giao dịch ngân hàng phát sinh từ 00:00 ngày 01/11/2026 (giờ Việt Nam).
- Tuyệt đối chặn mọi giao dịch trước mốc 01/11/2026 qua `BANK_SYNC_MIN_DATE`, `allowedBankSyncTime` và kiểm tra mốc ngày tại `fetchSourcePage` cùng `ingestBankPage`.
- Khi kích hoạt đồng bộ, hệ thống tự động gỡ bỏ khóa bảo trì `excel-import-paused:`, ghi nhận audit `BANK_SYNC_RESUMED`, và đưa các job đồng bộ của ngày 01/11/2026 về hàng đợi `QUEUED` để quét đầy đủ các giao dịch phát sinh từ đầu ngày.

### PWA và thông báo quản trị

Manifest `/manifest.webmanifest`, icon và `/sw.js` cho phép cài ứng dụng từ trình duyệt (iPhone: Chia sẻ → Thêm vào Màn hình chính). Service worker không lưu trang quản trị hay dữ liệu tài chính vào cache.

Trong thanh đầu trang quản trị, **Thông báo** cho phép chọn độc lập: sai tài khoản nhận, cần phân loại, đồng bộ lỗi. Lựa chọn lưu theo email quản trị; bật/tắt nhận riêng trên từng thiết bị. Quyền trình duyệt chỉ được hỏi khi bấm bật; iOS cần mở app đã cài (16.4+). Nút **Gửi thử** kiểm tra thiết bị, giới hạn một lần/phút.

Cấu hình ba biến server `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (URL HTTPS của website hoặc mailto hợp lệ). Sinh một cặp khóa bằng `web-push.generateVAPIDKeys()` và giữ nguyên qua các deployment. Chạy migration `20261101120000_admin_web_push` trước deploy. Không đưa private key ra client.

Giao dịch ngân hàng mới được xếp hàng thông báo trong cùng transaction nhập dữ liệu. Hai loại giao dịch không trùng nhau. Lỗi đồng bộ giao dịch hoặc tổng nguồn được gộp theo cửa sổ 30 phút. Webhook đồng bộ xử lý hàng đợi sau response bằng `after()`, kể cả lượt sync lỗi/bận. Chỉ gửi cho email vẫn còn trong `ADMIN_EMAILS` và vẫn bật loại thông báo tương ứng; bỏ qua giao dịch đã xử lý. Dịch vụ push lỗi tạm thời được thử tối đa 6 lần ở các lượt cron tiếp theo; endpoint hết hạn (404/410) bị xóa. Hàng đợi được giữ tối đa 7 ngày. Không gửi lại lịch sử khi vừa bật. Thông báo chỉ có số lượng, không có số tiền/tên/nội dung chuyển khoản. Push phụ thuộc mạng, quyền hệ điều hành và webhook đang chạy; không phải kênh báo động đảm bảo giao nhận.

Kiểm tra: `npx tsx --test tests/push-policy.test.ts`; chạy `tests/admin-push-integration.mts` với `--conditions=react-server --import tsx` và `DATABASE_URL` trỏ tới DB localhost rỗng tên bắt đầu `hvntvn_test`. Test dùng transport giả, không gửi thông báo thật.

### Cache public được chuẩn bị sẵn

API public đọc bản snapshot đầy đủ từ Vercel Runtime Cache, namespace `hvntvn-public-snapshot-v1` (dùng cùng region `iad1`). Tìm kiếm và phân trang chạy trên các dòng đã che dữ liệu riêng tư trong snapshot. Các khối dữ liệu bất biến được ghi trước; chỉ thay manifest sau khi ghi đủ, giữ nguyên bản cũ trong lúc làm mới. Cache tồn tại qua deployment; manifest giữ 6 ngày, khối dữ liệu giữ 7 ngày và được tạo lại hằng ngày. Cache có thể bị nền tảng thu hồi; khi thiếu, API phục hồi từ DB.

Migration `20261102070000_public_snapshot_queue` lưu hàng đợi theo phiên bản từng thiện pháp. REST admin đánh dấu làm mới sau thao tác ghi; đồng bộ ngân hàng đánh dấu những thiện pháp bị ảnh hưởng, kể cả xử lý lỗi sau khi đã ghi một phần. Webhook mỗi phút xử lý hàng đợi sau response, giới hạn khoảng 4 phút mỗi lượt; các quỹ active được xếp hàng đối chiếu toàn bộ ở lượt đầu tiên mỗi ngày theo giờ Việt Nam. Trong lúc tạo cache nếu có thay đổi mới, bỏ bản vừa dựng và thử lại theo phiên bản mới ở lượt sau. Lỗi tạo cache giữ bản gần nhất và hàng đợi để thử lại. Đổi tháng không trả các dòng của tháng trước.

Sau deploy hoặc khi cần nạp toàn bộ: POST `/api/internal/public-cache?force=1` với cùng Bearer `SYNC_SECRET`; gọi lại không có `force` nếu còn pending/busy. Endpoint có tối đa 300 giây và cùng khóa xử lý với webhook. Không mở endpoint này cho người dùng public. `X-Public-Cache: HIT/MISS` cho biết API có dùng bản chuẩn bị sẵn hay phải khôi phục. Runtime Cache có phí theo mức sử dụng của Vercel.

### Thông báo thiện pháp thành tựu

Khi thiện pháp đang hoạt động có mục tiêu dương và tổng hùn phước đạt/vượt mục tiêu, luồng REST quản trị và cron đồng bộ tạo một mốc bền vững cho cặp thiện pháp/mục tiêu. Tổng hùn phước dùng cùng phép tính với trang công khai, không trừ khoản chi. Thiện pháp đã đạt mục tiêu khi tính năng được bật cũng được thông báo ở lần quét đầu. Đổi sang mục tiêu khác sẽ tạo mốc mới nếu đã đạt; hạ số thu rồi tăng lại cùng mục tiêu không gửi lại.

Push gửi tới thiết bị quản trị đã đăng ký, có lựa chọn “Thiện pháp thành tựu” (mặc định bật). Email gửi riêng cho từng email quản trị trong `ADMIN_EMAILS`, cũng là danh sách email được phép đăng nhập Google. Không dùng email thí chủ. Bỏ email khỏi danh sách sẽ ngừng gửi các thư đang chờ của email đó.

Chạy `npm run db:migrate` khi triển khai. Cấu hình `RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM` (địa chỉ gửi thuộc miền đã xác minh ở Resend) và `AUTH_URL` (URL thật của ứng dụng). Google OAuth chỉ xác thực đăng nhập, không cung cấp quyền gửi thư. Không cấu hình email thì thư vẫn ở hàng đợi. Cron đồng bộ hiện có sẽ gửi lại; không cần cron mới. Mỗi lần xử lý tối đa 8 thư, thử tối đa 6 lần với backoff; cột `lastError` lưu lỗi. Khóa idempotency của Resend chống gửi trùng trong cửa sổ 24 giờ; các lần thử mơ hồ dừng sau 23 giờ từ lần đầu để tránh gửi lại ngoài cửa sổ đó. Giữ bản ghi `FundGoalAchievement` lâu dài để không tạo lại thông báo sau khi dọn hàng đợi push.
