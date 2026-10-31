## Quy tắc kiến trúc do người dùng yêu cầu

- Mặc định triển khai tương tác theo REST API trả JSON. Chuyển menu/tab, tìm kiếm, lọc, phân trang và làm mới dữ liệu phải xử lý phía client, chỉ gọi API lấy dữ liệu; giữ nguyên khung giao diện đã tải.
- Không dùng điều hướng RSC, `router.refresh()`, tải lại trang hoặc Server Actions từ client cho các tương tác trên và thao tác lưu. Backend có thể tái sử dụng nghiệp vụ hiện có qua REST route có xác thực, phân quyền và kiểm tra nguồn yêu cầu ghi.
- Component modal phải được import/tải sẵn, chỉ mở hiển thị rồi gọi API khi cần dữ liệu; không lazy load/dynamic import modal.
- Giữ URL và lịch sử Back/Forward hoạt động bằng History API. Tận dụng cache dữ liệu, gộp request trùng và vô hiệu hóa cache sau thay đổi; tránh request thừa và vòng lặp tự tải lại.
- SSR cho lần truy cập đầu vẫn được phép. Các tương tác tiếp theo dùng REST API; chỉ đổi kiến trúc này khi người dùng yêu cầu rõ ràng.
- Làm đúng kiến trúc ngay từ đầu, tái sử dụng mã và kiểm tra phù hợp phạm vi thay đổi để tránh làm lại, lãng phí thời gian và token của người dùng.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
