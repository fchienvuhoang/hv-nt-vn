export function allowedAdmin(email?: string | null) {
  return !!email && (process.env.ADMIN_EMAILS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}
