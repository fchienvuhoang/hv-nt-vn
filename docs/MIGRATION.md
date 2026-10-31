# Checklist chốt sổ đầu kỳ

## Chuẩn bị theo từng tài khoản

- Xác định mỗi Sheet thuộc tài khoản 0572 hay 0856, mã thiện pháp, trạng thái và từ khóa.
- Chọn mốc bắt đầu 00:00 giờ Việt Nam. Mọi Sheets và số dư ngân hàng phải được chốt ngay trước cùng mốc này.
- Lưu bản sao Sheets gốc để tra cứu lịch sử, có người kiểm tra và thời điểm chốt.
- Đánh dấu khoản điều chuyển cũ: nhận không tính vào hùn phước, chuyển đi không tính vào chi thực tế.
- Phí ngân hàng, hoàn tiền, giao dịch chưa rõ mã, khoản đang chờ ghi sổ cần rà soát riêng. Nếu là tiền thuộc thiện pháp thì ghi vào đúng thiện pháp; nếu chưa rõ thì giữ ở chưa phân bổ/chênh lệch có lý do.

## Bảng CSV đầu kỳ

Mỗi tài khoản nhập một file, UTF-8, cột:

| Cột | Ý nghĩa |
| --- | --- |
| code | Mã riêng trong tài khoản, ví dụ TP112 |
| name | Tên thiện pháp |
| status | ACTIVE / PAUSED / COMPLETED |
| keywords | Từ khóa mở rộng, phân cách bằng dấu chấm phẩy |
| openingIncome | Tổng hùn phước lịch sử, số nguyên VND không dấu phân cách |
| openingExpense | Tổng chi thực tế lịch sử |
| openingTransferNet | Tổng điều chuyển nhận trừ tổng điều chuyển đi, được âm |

Số dư đầu kỳ thiện pháp = openingIncome − openingExpense + openingTransferNet.

Ví dụ A nhận hùn 10 triệu, chi 3 triệu, chuyển sang B 2 triệu: A nhập 10000000, 3000000, -2000000 → số dư 5 triệu. B ghi phần nhận vào openingTransferNet, không ghi là hùn mới.

Đây là tổng hợp trước ngày vận hành. Không nhập lại những khoản này vào sao kê sau mốc chuyển đổi. Trước khóa sổ có thể nhập lại CSV; cùng mã sẽ được ghi đè, không cộng thêm. File nhập không xóa những thiện pháp vắng mặt trong file. Sau khóa sổ biểu mẫu đầu kỳ bị chặn ở server.

## Đối chiếu

Số dư ngân hàng tại mốc chốt = tổng số dư thiện pháp + tiền chưa phân bổ + chênh lệch đầu kỳ.

Nếu chưa khớp, tìm nguyên nhân trước. Có thể khóa với chênh lệch đã biết nhưng phải ghi lý do; khoản này hiển thị riêng cho quản trị, không tự cộng vào thiện pháp.

Sau khi khóa, số dư ngân hàng tính toán = số dư ngân hàng đầu kỳ + CREDIT mới − DEBIT mới.

Đối chiếu số này với tổng số dư thiện pháp + tiền chưa phân bổ hiện tại + chênh lệch đầu kỳ. Sai lệch kiểm tra hệ thống phải bằng 0; vẫn cần đối chiếu định kỳ với số dư ngân hàng thật vì API hiện không trả số dư.

## Bắt đầu vận hành

- Đồng bộ và kiểm tra cả CREDIT lẫn DEBIT của hai tài khoản.
- Kiểm tra giao dịch đúng ngày chuyển đổi, trùng ID, mã tạm dừng/hoàn thành và khoản không có mã.
- Mở trang công khai, đối chiếu số tổng hợp và nội dung đã che điện thoại.
- Kiểm tra điều chuyển cùng tài khoản không làm tăng hùn/chi; thử trường hợp không đủ tiền và bút toán đảo.
- Sau khi ban quản trị xác nhận, ngừng ghi thủ công phần sau mốc chốt trên Sheets để tránh hai nguồn số liệu khác nhau.

Nếu phát hiện chốt sai sau khi đã nhập giao dịch, không xóa/reset database tùy tiện. Sao lưu, lập biên bản sai lệch và xây migration điều chỉnh có kiểm tra; bản hiện tại không có nút mở khóa hoặc sửa đầu kỳ sau xác nhận.
