"use client";
import { useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

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
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  trigger?: React.ReactNode;
  defaultOpen?: boolean;
  closeHref?: string;
  wide?: boolean;
  triggerClassName?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(),
    descriptionId = useId();
  const router = useRouter();
  useEffect(() => {
    if (defaultOpen && !dialog.current?.open) dialog.current?.showModal();
  }, [defaultOpen]);
  const close = () => dialog.current?.close();
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
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <span>Dữ liệu được lưu khi bạn xác nhận biểu mẫu.</span>
          <button type="button" className="button subtle" onClick={close}>
            Đóng
          </button>
        </div>
      </dialog>
    </>
  );
}
