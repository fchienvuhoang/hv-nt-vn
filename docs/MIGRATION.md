# Chuyển dữ liệu từ Sheets sang hệ thống

Không cần chốt sổ hoặc nhập số dư đầu kỳ để đồng bộ. Không xóa dữ liệu cũ để bắt đầu lại.

1. Lưu một bản sao từng Google Sheets trước khi nhập. Xuất Microsoft Excel (.xlsx), giữ các tab TK Mỹ và TK Trâm.
2. Tạo đúng thiện pháp trong trang Thiện pháp. Một thiện pháp dùng chung cho hai tài khoản; giao dịch vẫn tách theo tài khoản nguồn.
3. Chọn Nhập Excel, tải file và kiểm tra từng tab: tài khoản, số giao dịch, tổng thu, tổng chi và dòng mẫu. Hỗ trợ cột STT, Thời gian, Chủ tài khoản, Nội dung, Tiền ra, Tiền vào, Ghi chú của ba file mẫu TP54/TP63/TP112. Không lấy dòng tổng hoặc số m²/số vị làm tiền.
4. Nếu có dòng lỗi, sửa file rồi tải lại. Nếu tổng chi tiết khác tổng trong file, tìm công thức/dòng thiếu trước khi xác nhận ngoại lệ. Tổng tổng hợp có sẵn chỉ được thay bằng chi tiết sau xác nhận, có lịch sử.
5. Xác nhận từng tab để nhập. Có thể đóng và mở lại lịch sử để tiếp tục; cùng file/tab không cộng lần hai. File đã sửa có hash khác, cần kiểm tra kết quả đối chiếu, không coi đó là thao tác thay toàn bộ file cũ.
6. Trong Đồng bộ, đặt ngày bắt đầu đủ bao phủ lịch sử cần lấy rồi đồng bộ CREDIT và DEBIT. Có thể nhập Excel trước hoặc sau sao kê. Hệ thống ghép khi khớp duy nhất theo tham chiếu đầy đủ hoặc thời gian/nội dung/số tiền. Chỉ giống ngày/số tiền thì đưa vào danh sách nghi trùng, chưa cộng tổng.
7. Vào Giao dịch xử lý các dòng nghi trùng: ghép với giao dịch thực sự tương ứng hoặc xác nhận là khoản riêng. Gán tay và ghi lý do nếu cần, kể cả thiện pháp tạm dừng/hoàn thành.
8. Đối chiếu từng tài khoản: số dư dự kiến = tổng (thu − chi + điều chuyển ròng) các thiện pháp + tiền chưa phân bổ. So với số dư ngân hàng thực tế tại cùng thời điểm; API hiện không cung cấp số dư ngân hàng để tự khẳng định khớp.

Không cộng tổng thu thành số dư tài khoản: phải trừ tổng chi. Điều chuyển giữa thiện pháp trong cùng tài khoản không làm tăng tổng hùn hoặc tổng chi và không đổi tổng số dư tài khoản. Khoản điều chuyển cũ được ghi trong Excel như thu/chi cần kiểm tra và xử lý riêng để không công bố nhầm là hùn mới; hệ thống không đoán điều chuyển từ ghi chú.

Các dòng Excel được gán tay cho thiện pháp đã chọn, giữ nguyên lịch sử team đã phân bổ. Trường hợp sao kê đang được gán tay sang thiện pháp khác sẽ được giữ để quản trị kiểm tra. Bản gốc và dấu vết ghép được lưu, không xóa giao dịch nguồn.

Sau khi đã đối chiếu, chọn hệ thống làm nơi ghi chính; tránh tiếp tục chỉnh hai nguồn độc lập. Trang công khai dùng cache, che điện thoại và báo khi dữ liệu đang nhập dở. Chỉ công bố sau khi kiểm tra tổng và các dòng nghi trùng.
