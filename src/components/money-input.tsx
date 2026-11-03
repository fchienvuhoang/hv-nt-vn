"use client";
import { useId, useState } from "react";
import type { InputHTMLAttributes, KeyboardEvent, ChangeEvent, ClipboardEvent } from "react";
import { formatMoneyInput, moneyInputDigits, pastedMoneyDigits, moneyCaretPosition } from "@/lib/money-input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "pattern" | "maxLength" | "onPaste" | "onKeyDown"> & {
  value: string;
  onValueChange: (digits: string) => void;
  maxDigits?: number;
};

export function MoneyInput({ value, onValueChange, name, disabled, maxDigits = 15, className = "", ...props }: Props) {
  const [error, setError] = useState("");
  const errorId = useId();
  const displayed = formatMoneyInput(value);
  function apply(input: HTMLInputElement, draft: string, digitsBeforeCaret: number) {
    const digits = moneyInputDigits(draft, maxDigits);
    if (digits === null) {
      input.value = displayed;
      const message = `Chỉ nhập số tiền nguyên không âm, tối đa ${maxDigits} chữ số.`;
      input.setCustomValidity(message);
      setError(message);
      return;
    }
    input.setCustomValidity("");
    setError("");
    const formatted = formatMoneyInput(digits);
    onValueChange(digits);
    input.value = formatted;
    const position = moneyCaretPosition(formatted, digitsBeforeCaret);
    input.setSelectionRange(position, position);
  }
  function change(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    apply(input, input.value, input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length);
  }
  function paste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const digits = pastedMoneyDigits(event.clipboardData.getData("text"), maxDigits);
    if (digits === null) {
      const message = "Số tiền dán vào không hợp lệ hoặc vượt giới hạn. Ví dụ: 10.000.000 ₫.";
      event.currentTarget.setCustomValidity(message);
      setError(message);
      return;
    }
    const input = event.currentTarget, start = input.selectionStart ?? 0, end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    apply(input, before + digits + input.value.slice(end), before.replace(/\D/g, "").length + digits.length);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget, start = input.selectionStart ?? 0;
    if (event.altKey || event.ctrlKey || event.metaKey || start !== input.selectionEnd) return;
    // Backspace/Delete next to a grouping dot must delete a digit, not get stuck restoring the dot.
    const backward = event.key === "Backspace" && input.value[start - 1] === ".";
    const forward = event.key === "Delete" && input.value[start] === ".";
    if (!backward && !forward) return;
    event.preventDefault();
    const before = input.value.slice(0, start).replace(/\D/g, "").length;
    const index = backward ? before - 1 : before;
    apply(input, value.slice(0, index) + value.slice(index + 1), backward ? before - 1 : before);
  }
  return <>
    {name && <input type="hidden" name={name} value={value} disabled={disabled}/>}
    <input {...props} type="text" inputMode="numeric" autoComplete="off" disabled={disabled} value={displayed} onChange={change} onPaste={paste} onKeyDown={keyDown} pattern="[0-9]{1,3}(\.[0-9]{3})*" maxLength={maxDigits + Math.floor((maxDigits - 1) / 3)} className={`money-input ${className}`.trim()} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={[props["aria-describedby"], error ? errorId : ""].filter(Boolean).join(" ") || undefined}/>
    {error && <span id={errorId} className="field-error" role="alert">{error}</span>}
  </>;
}
