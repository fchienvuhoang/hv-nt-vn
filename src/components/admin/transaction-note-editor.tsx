"use client";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { ActionForm } from "@/components/action-form";
import { saveTransactionNote } from "@/lib/admin-api";
export function TransactionNoteEditor({transactionId,narrative}:{transactionId:string;narrative:string}) {
  const [revision,setRevision]=useState(0),[requestId,setRequestId]=useState("");
  return <Modal onOpen={()=>{setRequestId(crypto.randomUUID());setRevision(n=>n+1)}} title="Thêm ghi chú công khai" trigger="Ghi chú" triggerClassName="button subtle small" description="Ghi chú được hiển thị cho thí chủ; nội dung chuyển khoản gốc được giữ nguyên.">
    <p className="sheet-narrative">{narrative}</p>
    <ActionForm key={revision} action={saveTransactionNote} label="Lưu ghi chú công khai" lockAfterSuccess closeOnSuccess>
      <input type="hidden" name="transactionId" value={transactionId}/><input type="hidden" name="requestId" value={requestId}/>
      <label>Ghi chú<textarea name="text" rows={3} required minLength={3} maxLength={2000}/></label>
    </ActionForm>
  </Modal>;
}
