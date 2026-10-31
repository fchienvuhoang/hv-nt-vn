"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

const ModalCloseContext = createContext<(() => void) | undefined>(undefined);
export const useCloseModal = () => useContext(ModalCloseContext);

/** Native dialog supplies focus trapping, Escape dismissal and focus restoration. */
export function Modal({
  title,
  description,
  children,
  trigger,
  defaultOpen = false,
  closeHref,
  wide = false,
  triggerClassName = "button subtle",
  footerNote = "Dữ liệu được lưu khi bạn xác nhận biểu mẫu.",
  onDismiss,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  trigger?: React.ReactNode;
  defaultOpen?: boolean;
  closeHref?: string;
  wide?: boolean;
  triggerClassName?: string;
  footerNote?: string;
  onDismiss?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(),
    descriptionId = useId();
  const router = useRouter();
  useEffect(() => {
    if (defaultOpen && !dialog.current?.open) dialog.current?.showModal();
  }, [defaultOpen]);
  const close = useCallback(() => dialog.current?.close(), []);
  return (
    <>
      {trigger && (
        <button
          type="button"
          className={triggerClassName}
          aria-haspopup="dialog"
          onClick={() => dialog.current?.showModal()}
        >
          {trigger}
        </button>
      )}
      <dialog
        ref={dialog}
        className={`modal ${wide ? "modal-wide" : ""}`}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onClose={() => {
          onDismiss?.();
          if (closeHref) router.replace(closeHref, { scroll: false });
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            close();
        }}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">HÙN PHƯỚC · THAO TÁC</span>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Đóng hộp thoại"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body"><ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider></div>
        <div className="modal-footer">
          {footerNote && <span>{footerNote}</span>}
          <button type="button" className="button subtle" onClick={close}>
            Đóng
          </button>
        </div>
      </dialog>
    </>
  );
}
