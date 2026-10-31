"use client";
import { useActionState } from "react";
import type { ActionState } from "@/app/admin/actions";
export function ActionForm({
  action,
  children,
  label = "Lưu thay đổi",
  className = "",
  confirm,
  lockAfterSuccess = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  label?: string;
  className?: string;
  confirm?: string;
  lockAfterSuccess?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  return (
    <form
      action={dispatch}
      className={`action-form ${className}`}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {children}
      {state.error && (
        <div role="alert" className="notice danger">
          {state.error}
        </div>
      )}
      {state.success && (
        <div role="status" className="notice success">
          {state.success}
        </div>
      )}
      <button
        className="button primary"
        type="submit"
        disabled={pending || (lockAfterSuccess && !!state.success)}
      >
        {pending
          ? "Đang xử lý…"
          : lockAfterSuccess && state.success
            ? "Đã ghi nhận"
            : label}
      </button>
    </form>
  );
}
