"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import type { ActionState } from "@/app/admin/actions";
type ToastKind = "success" | "error";
type ToastItem = { id: number; message: string; kind: ToastKind };
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const region = useRef<HTMLDivElement>(null);
  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = ++sequence.current;
    setItems(previous => [...previous.slice(-3), { id, message, kind }]);
    const timer = setTimeout(() => { setItems(previous => previous.filter(item => item.id !== id)); timers.current.delete(timer); }, kind === "error" ? 9000 : 5500);
    timers.current.add(timer);
  }, []);
  useEffect(() => {
    const element = region.current;
    if (items.length) element?.showPopover?.(); else element?.hidePopover?.();
  }, [items]);
  useEffect(() => { const pending = timers.current; return () => pending.forEach(clearTimeout); }, []);
  return <ToastContext.Provider value={toast}>
    {children}
    <div className="toast-region" ref={region} popover="manual" aria-label="Thông báo thao tác">
      {items.map(item => <div key={item.id} className={`toast-item toast-${item.kind}`} role={item.kind === "error" ? "alert" : "status"}>
        {item.kind === "success" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
        <span>{item.message}</span>
        <button type="button" aria-label="Đóng thông báo" onClick={() => setItems(previous => previous.filter(t => t.id !== item.id))}><X size={15} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}
export function useActionToast(state: ActionState, onSuccess?: () => void) {
  const toast = useToast();
  const handled = useRef<ActionState | null>(null);
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.success) { toast(state.success); onSuccess?.(); }
    else if (state.error) toast(state.error, "error");
    // Field validation stays next to the input, without a duplicate toast.
  }, [state, toast, onSuccess]);
}
