"use client";
import { LoadingSpinner } from "@/components/loading-indicator";
import { useCloseModal } from "@/components/modal";
import { useActionState } from "react";
import { useToast } from "@/components/toasts";
import type { ActionState } from "@/app/admin/actions";
export function ActionForm({
  action,
  children,
  label = "Lưu thay đổi",
  className = "",
  confirm,
  lockAfterSuccess = false,
  closeOnSuccess = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  label?: string;
  className?: string;
  confirm?: string;
  lockAfterSuccess?: boolean;
  closeOnSuccess?: boolean;
}) {
  const close=useCloseModal();
  const toast=useToast();
  const [state, dispatch, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const result = await action(previous, form);
    // Close the native dialog before React commits the action transition or reloads the list.
    if (closeOnSuccess && result.success && !result.error && !result.fieldErrors) close?.();
    if (result.success) toast(result.success);
    else if (result.error) toast(result.error, "error");
    return result;
  }, {});
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
          ? <><LoadingSpinner size={20}/>Đang xử lý…</>
          : lockAfterSuccess && state.success
            ? "Đã ghi nhận"
            : label}
      </button>
    </form>
  );
}
