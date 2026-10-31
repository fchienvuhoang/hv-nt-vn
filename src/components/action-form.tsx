"use client";
import { useActionState } from "react";
import { useActionToast } from "@/components/toasts";
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
  useActionToast(state);
  return (
    <form
      action={dispatch}
      className={`action-form ${className}`}
      onReset={event => event.preventDefault()}
      aria-busy={pending}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <fieldset disabled={pending} className="action-fields">{children}</fieldset>
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
