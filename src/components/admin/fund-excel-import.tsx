"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toasts";
import { FileUp, Play, RotateCw } from "lucide-react";
import { uploadFundExcel, commitFundExcel } from "@/app/admin/actions";
import type { ExcelUploadState } from "@/app/admin/actions";
import type { FundImportSummary } from "@/lib/fund-imports";
import { dateTime, vnd } from "@/lib/domain";
export function FundExcelImport({
  fundId,
  legacy,
  history,
}: {
  fundId: string;
  legacy: {
    accountId: string;
    income: string;
    expense: string;
    transfer: string;
  };
  history: FundImportSummary[];
}) {
  const toast = useToast();
  const handledUpload = useRef<ExcelUploadState | null>(null);
  const [state, upload, pending] = useActionState<ExcelUploadState, FormData>(
    uploadFundExcel,
    {},
  );
  useEffect(() => {
    if (handledUpload.current === state) return;
    handledUpload.current = state;
    if (state.error) toast(state.error, "error");
    else if (state.batches) toast("Đã đọc file Excel. Kiểm tra các bảng trước khi xác nhận nhập.");
  }, [state, toast]);
  const [selected, setSelected] = useState(""),
    [running, setRunning] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<FundImportSummary | null>(null);
  const [replace, setReplace] = useState(false),
    [mismatchAccepted, setMismatchAccepted] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const batches = state.batches ?? history;
  const batch =
    progress && progress.id === (selected || batches[0]?.id)
      ? progress
      : (batches.find((b) => b.id === selected) ?? batches[0]);
  const hasLegacy =
    (!batch?.accountId || batch.accountId === legacy.accountId) &&
    [legacy.income, legacy.expense, legacy.transfer].some(
      (n) => BigInt(n) !== 0n,
    );
  const mismatch =
    !!batch &&
    ((batch.sourceIncome !== null && batch.sourceIncome !== batch.income) ||
      (batch.sourceExpense !== null && batch.sourceExpense !== batch.expense));
  async function start() {
    if (!batch) return;
    setRunning(true);
    setError("");
    try {
      while (alive.current) {
        const result = await commitFundExcel({
          batchId: batch.id,
          replaceLegacy: replace,
          acceptMismatch: mismatchAccepted,
        });
        if (!alive.current) break;
        if (result.error) {
          toast(result.error, "error");
          setError(result.error);
          break;
        }
        if (!result.batch) break;
        setProgress(result.batch);
        if (result.batch.status === "COMPLETE") { toast("Đã nhập xong Excel. Kiểm tra các khoản nghi trùng trong Giao dịch."); break; }
      }
    } catch {
      if (alive.current) toast("Kết nối bị gián đoạn. Bạn có thể mở lại và tiếp tục nhập.", "error");
      if (alive.current)
        setError(
          "Kết nối bị gián đoạn. Mở lại lịch sử nhập và tiếp tục; các dòng đã lưu không bị nhập trùng.",
        );
    } finally {
      if (alive.current) setRunning(false);
    }
  }
  return (
    <div className="excel-import">
      <div className="notice">
        Nhập chi tiết của đúng thiện pháp này. Hệ thống tự bỏ dòng tổng, dòng
        phụ như m²/số vị, đọc tiền có dấu chấm hoặc dấu phẩy và đối chiếu sao kê
        để tránh cộng hai lần.
      </div>
      <form
        action={upload}
        className="action-form"
        onSubmit={() => {
          setSelected("");
          setProgress(null);
          setError("");
          setReplace(false);
          setMismatchAccepted(false);
        }}
      >
        <input type="hidden" name="fundId" value={fundId} />
        <label>
          File từ Excel hoặc Google Sheets
          <input
            name="file"
            type="file"
            accept=".xlsx"
            required
            disabled={running}
          />
          <small>
            Google Sheets → Tệp → Tải xuống → Microsoft Excel (.xlsx). Tối đa 5
            MB, 10.000 giao dịch.
          </small>
        </label>
        <button className="button subtle" disabled={pending || running}>
          {pending ? (
            "Đang đọc file…"
          ) : (
            <>
              <FileUp size={15} />
              Đọc file Excel
            </>
          )}
        </button>
      </form>
      {batches.length > 0 && (
        <div className="excel-import-preview">
          <label>
            Bảng trong file / lịch sử nhập
            <select
              value={batch?.id ?? ""}
              disabled={running}
              onChange={(event) => {
                setSelected(event.target.value);
                setProgress(null);
                setError("");
                setMismatchAccepted(false);
                setReplace(false);
              }}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fileName} · {b.sheetName} · TK {b.account?.number ?? ""} ·{" "}
                  {b.status === "COMPLETE"
                    ? "Đã nhập"
                    : `${b.cursor}/${b.rowCount} dòng`}
                </option>
              ))}
            </select>
          </label>
          {batch && (
            <>
              <div className="notice">
                Bảng này được nhập vào tài khoản{" "}
                {batch.account?.number ?? "chính"} của thiện pháp.
              </div>
              <div className="import-summary">
                <div>
                  <small>Giao dịch hợp lệ</small>
                  <strong>{batch.rowCount.toLocaleString("vi-VN")}</strong>
                </div>
                <div>
                  <small>Tổng thu từ các dòng</small>
                  <strong>{vnd(batch.income)}</strong>
                </div>
                <div>
                  <small>Tổng chi từ các dòng</small>
                  <strong>{vnd(batch.expense)}</strong>
                </div>
              </div>
              <p className="muted">
                Bỏ qua {batch.skipped} dòng tiêu đề/tổng hợp/phụ. Nhập theo từng
                đợt, có thể tiếp tục nếu gián đoạn.
              </p>
              {batch.errors.length > 0 && (
                <div className="notice danger" role="alert">
                  <strong>
                    File có {batch.errors.length} dòng lỗi được liệt kê. Cần sửa
                    trước khi nhập.
                  </strong>
                  <ul>
                    {batch.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {mismatch && (
                <div className="notice danger">
                  <p>
                    Dòng tổng trong file: thu {vnd(batch.sourceIncome ?? "0")},
                    chi {vnd(batch.sourceExpense ?? "0")}. Số này khác tổng các
                    giao dịch hợp lệ.
                  </p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={mismatchAccepted}
                      onChange={(e) => setMismatchAccepted(e.target.checked)}
                      disabled={running}
                    />
                    Tôi đã kiểm tra và chọn nhập theo các dòng chi tiết.
                  </label>
                </div>
              )}
              {hasLegacy && batch.cursor === 0 && (
                <div className="notice">
                  <p>
                    Đang có tổng lịch sử cũ: thu {vnd(legacy.income)}, chi{" "}
                    {vnd(legacy.expense)}, điều chuyển ròng{" "}
                    {vnd(legacy.transfer)}.
                  </p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={replace}
                      onChange={(e) => setReplace(e.target.checked)}
                      disabled={running}
                    />
                    Thay các tổng cũ bằng chi tiết trong file này, không cộng
                    thêm lần nữa.
                  </label>
                </div>
              )}
              <div className="table-scroll table-card import-sample">
                <table>
                  <thead>
                    <tr>
                      <th>Dòng / thời gian</th>
                      <th>Nội dung mẫu</th>
                      <th>Thu / chi</th>
                      <th className="align-right">Số tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.sample.map((row) => (
                      <tr key={row.row}>
                        <td>
                          {row.row}
                          <small>{dateTime(row.at)}</small>
                        </td>
                        <td className="narrative">{row.narrative}</td>
                        <td>{row.direction === "CREDIT" ? "Thu" : "Chi"}</td>
                        <td className="money align-right nowrap">
                          {vnd(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="import-progress" role="status">
                <progress
                  max={Math.max(1, batch.rowCount)}
                  value={batch.cursor}
                />
                <span>
                  Đã xử lý {batch.cursor}/{batch.rowCount} · Thêm {batch.added}{" "}
                  · Đối chiếu {batch.matched} · Chờ kiểm tra {batch.review}
                </span>
              </div>
              {error && (
                <div className="notice danger" role="alert">
                  {error}
                </div>
              )}
              {batch.status === "COMPLETE" ? (
                <div className="notice success">
                  Đã nhập xong. Các khoản chờ kiểm tra nghi trùng chưa cộng vào
                  tổng; mở Giao dịch để xử lý.
                </div>
              ) : (
                <button
                  className="button primary"
                  type="button"
                  onClick={start}
                  disabled={
                    running ||
                    pending ||
                    !!batch.errors.length ||
                    !batch.rowCount ||
                    (mismatch && !mismatchAccepted) ||
                    (hasLegacy && batch.cursor === 0 && !replace)
                  }
                >
                  {running ? (
                    "Đang nhập…"
                  ) : batch.cursor ? (
                    <>
                      <RotateCw size={15} />
                      Tiếp tục nhập
                    </>
                  ) : (
                    <>
                      <Play size={15} />
                      Xác nhận nhập vào thiện pháp
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
