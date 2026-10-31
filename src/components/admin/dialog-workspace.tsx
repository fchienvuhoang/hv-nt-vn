"use client";
import { createContext, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Fund } from "@/generated/prisma/client";
import type { FundImportSummary } from "@/lib/fund-imports";
import { Modal } from "@/components/modal";
import { FundTransactions } from "./fund-transactions";
import { FundForm } from "./fund-form";
import { FundExcelImport } from "./fund-excel-import";
import { TransferFormFields } from "./transfer-form-fields";
import { getFundImportHistory } from "@/lib/admin-api";
import { useToast } from "@/components/toasts";

type DialogKind = "create-fund" | "edit-fund" | "import-fund" | "transfer" | "fund-transactions";
type Selection = { kind: DialogKind; fundId?: string } | null;
type TransferFunds = React.ComponentProps<typeof TransferFormFields>["funds"];
const DialogContext = createContext<((kind: DialogKind, fundId?: string) => void) | null>(null);
export function AdminDialogButton({kind,fundId,children,className="button subtle"}:{kind:DialogKind;fundId?:string;children:ReactNode;className?:string}) {
  const show=useContext(DialogContext);
  return <button type="button" className={className} aria-haspopup="dialog" onClick={()=>show?.(kind,fundId)}>{children}</button>;
}

/** All dialog modules are statically imported and all shells render with the page. */
export function DialogWorkspace({children,funds,accounts,transferFunds,initial,initialHistory,initialRequestId}:{
  children:ReactNode;funds:Fund[];accounts:{id:string;number:string;label:string}[];
  transferFunds:TransferFunds;initial:Selection;initialHistory:FundImportSummary[];initialRequestId:string;
}) {
  const [selection,setSelection]=useState(initial),[revision,setRevision]=useState(0),[requestId,setRequestId]=useState(initialRequestId);
  const [history,setHistory]=useState(initialHistory),[historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState("");
  const historyRequest=useRef(0);
  const toast=useToast();
  const transactionFund=selection?.kind==="fund-transactions"?funds.find(f=>f.id===selection.fundId):funds[0];
  const editFund=selection?.kind==="edit-fund"?funds.find(f=>f.id===selection.fundId):funds[0];
  const importFund=selection?.kind==="import-fund"?funds.find(f=>f.id===selection.fundId):funds[0];
  function dismiss() {
    historyRequest.current++;
    setSelection(null);
    // Old bookmarked modal URLs still work; closing them never navigates/refetches.
    const url=new URL(window.location.href);
    if(url.searchParams.has("modal")){
      url.searchParams.delete("modal");url.searchParams.delete("fundId");
      window.history.replaceState(window.history.state,"",url.pathname+url.search);
    }
  }
  function show(kind:DialogKind,fundId?:string) {
    setSelection({kind,fundId});setRevision(n=>n+1);
    if(kind==="transfer")setRequestId(crypto.randomUUID());
    if(kind==="import-fund"&&fundId){
      const request=++historyRequest.current;
      setHistory([]);setHistoryError("");setHistoryLoading(true);
      void getFundImportHistory(fundId).then(result=>{
        if(request!==historyRequest.current)return;
        if(result.error){setHistoryError(result.error);toast(result.error,"error");}
        else setHistory(result.history??[]);
      }).catch(()=>{
        if(request!==historyRequest.current)return;
        const message="Không tải được lịch sử nhập Excel. Đóng và mở lại để thử.";
        setHistoryError(message);toast(message,"error");
      }).finally(()=>{if(request===historyRequest.current)setHistoryLoading(false)});
    }
  }
  return <DialogContext.Provider value={show}>
    {children}
    <div data-admin-dialog="create-fund"><Modal open={selection?.kind==="create-fund"} onDismiss={dismiss} title="Tạo thiện pháp mới" description="Thông tin, từ khóa phân loại và trạng thái hoạt động.">
      <FundForm key={`create-${revision}`} accounts={accounts} />
    </Modal></div>
    <div data-admin-dialog="edit-fund"><Modal open={selection?.kind==="edit-fund"} onDismiss={dismiss} title={`Cấu hình ${editFund?.code??"thiện pháp"}`} description="Thông tin, từ khóa phân loại và trạng thái hoạt động.">
      {editFund?<FundForm key={`edit-${editFund.id}-${revision}`} accounts={accounts} fund={editFund}/>:<div className="notice danger">Không tìm thấy thiện pháp này.</div>}
    </Modal></div>
    <div data-admin-dialog="import-fund"><Modal wide open={selection?.kind==="import-fund"} onDismiss={dismiss} title={`Nhập Excel · ${importFund?.code??"thiện pháp"}`} description={importFund?.name}>
      {historyLoading&&<p role="status">Đang cập nhật lịch sử nhập Excel…</p>}
      {historyError&&<div className="notice danger" role="alert">{historyError}</div>}
      {importFund?<FundExcelImport key={importFund.id} active={selection?.kind==="import-fund"} fundId={importFund.id} legacy={{accountId:importFund.accountId,income:importFund.openingIncome.toString(),expense:importFund.openingExpense.toString(),transfer:importFund.openingTransferNet.toString()}} history={history}/>:<div className="notice danger">Không tìm thấy thiện pháp này.</div>}
    </Modal></div>
    <div data-admin-dialog="fund-transactions"><Modal wide open={selection?.kind==="fund-transactions"} onDismiss={dismiss} title={`Giao dịch · ${transactionFund?.code??"thiện pháp"}`} description={transactionFund?.name} footerNote="Lý do và ghi chú được hiển thị công khai; mọi thao tác đều lưu người thực hiện và thời gian.">
      {transactionFund&&<FundTransactions key={`${transactionFund.id}-${revision}`} fundId={transactionFund.id} active={selection?.kind==="fund-transactions"} funds={funds} accounts={accounts}/>}
    </Modal></div>
    <div data-admin-dialog="transfer"><Modal open={selection?.kind==="transfer"} onDismiss={dismiss} title="Điều chuyển giữa các thiện pháp" description="Ghi rõ lý do, giữ trọn lịch sử phân bổ.">
      <TransferFormFields key={`transfer-${revision}`} requestId={requestId} accounts={accounts} funds={transferFunds}/>
    </Modal></div>
  </DialogContext.Provider>;
}
