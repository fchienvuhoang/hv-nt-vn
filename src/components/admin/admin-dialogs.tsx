import { db } from "@/lib/db";
import { fundTotals } from "@/lib/ledger";
import { listFundImports } from "@/lib/fund-imports";
import { FundExcelImport } from "./fund-excel-import";
import { Modal } from "@/components/modal";
import { FundForm } from "./fund-form";
import { TransferForm } from "./transfer-form";
import {
  adminUrl,
  type AdminParams,
  type AdminView,
} from "@/lib/admin-navigation";
export async function AdminDialogs({
  view,
  params,
}: {
  view: AdminView;
  params: AdminParams;
}) {
  const { modal, fundId, ...rest } = params;
  const closeHref = adminUrl(view, rest);
  if (modal === "create-fund" || modal === "edit-fund") {
    const [accounts, fund] = await Promise.all([
      db.bankAccount.findMany({ orderBy: { number: "asc" } }),
      modal === "edit-fund" && fundId
        ? db.fund.findUnique({ where: { id: fundId } })
        : Promise.resolve(null),
    ]);
    return (
      <Modal
        key={`${modal}-${fundId ?? "new"}`}
        defaultOpen
        title={
          modal === "create-fund"
            ? "Tạo thiện pháp mới"
            : `Cấu hình ${fund?.code ?? "thiện pháp"}`
        }
        description="Thông tin, từ khóa phân loại và trạng thái hoạt động."
        closeHref={closeHref}
      >
        {modal === "edit-fund" && !fund ? (
          <div className="notice danger">
            Không tìm thấy thiện pháp này. Đóng hộp thoại và chọn lại.
          </div>
        ) : (
          <FundForm accounts={accounts} fund={fund} />
        )}
      </Modal>
    );
  }
  if (modal === "import-fund" && fundId) {
    const fund = await db.fund.findUnique({ where: { id: fundId } });
    if (!fund)
      return (
        <Modal defaultOpen title="Nhập Excel" closeHref={closeHref}>
          <div className="notice danger">Không tìm thấy thiện pháp.</div>
        </Modal>
      );
    return (
      <Modal
        key={fundId}
        defaultOpen
        wide
        title={`Nhập Excel · ${fund.code}`}
        description={fund.name}
        closeHref={closeHref}
      >
        <FundExcelImport
          fundId={fund.id}
          legacy={{
            accountId: fund.accountId,
            income: fund.openingIncome.toString(),
            expense: fund.openingExpense.toString(),
            transfer: fund.openingTransferNet.toString(),
          }}
          history={await listFundImports(fund.id)}
        />
      </Modal>
    );
  }
  if (modal === "transfer")
    return (
      <Modal
        defaultOpen
        title="Điều chuyển giữa các thiện pháp"
        description="Ghi rõ lý do, giữ trọn lịch sử phân bổ."
        closeHref={closeHref}
      >
        <TransferForm funds={await fundTotals()} />
      </Modal>
    );
  return null;
}
