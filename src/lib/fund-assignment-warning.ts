export function fundAssignmentWarning(fund?: { code: string; status: string }) {
  if (!fund || fund.status === "ACTIVE") return "";
  const status = fund.status === "COMPLETED" ? "đã đóng / hoàn thành" : "đang tạm dừng";
  return `Thiện pháp ${fund.code} ${status}. Gán tay vẫn được ghi nhận và làm thay đổi số liệu của thiện pháp này.`;
}
