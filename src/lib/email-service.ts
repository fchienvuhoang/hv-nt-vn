import "server-only";

export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY?.trim() && process.env.NOTIFICATION_EMAIL_FROM?.trim());
}

type LogoAttachment = { ContentType: string; Filename: string; ContentID: string; Base64Content: string };
export async function sendNotificationEmail(input: { to: string; subject: string; TextPart: string; HTMLPart: string; attachments: LogoAttachment[]; idempotencyKey: string }) {
  if (!emailConfigured()) throw new Error("Chưa cấu hình Resend hoặc địa chỉ gửi email.");
  const name = (process.env.NOTIFICATION_EMAIL_FROM_NAME || "Học viện Nguyên Thủy Việt Nam").replace(/[<>\r\n]/g, "");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      from: `${name} <${process.env.NOTIFICATION_EMAIL_FROM}>`, to: [input.to], subject: input.subject,
      text: input.TextPart, html: input.HTMLPart,
      attachments: input.attachments.map(attachment => ({ filename: attachment.Filename, content: attachment.Base64Content, content_type: attachment.ContentType, content_id: attachment.ContentID })),
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: unknown } | null;
    const message = typeof error?.message === "string"
      ? error.message.replaceAll(process.env.RESEND_API_KEY!, "[redacted]").slice(0, 400) : "";
    throw new Error(`Resend HTTP ${response.status}${message ? `: ${message}` : ""}`);
  }
  const result = await response.json() as { id?: unknown };
  if (typeof result.id !== "string" || !result.id) throw new Error("Resend chưa xác nhận mã email đã gửi.");
  return result.id;
}
