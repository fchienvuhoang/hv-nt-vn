/** Preserve the pg driver's existing certificate verification without deprecated SSL aliases. */
export function databaseConnectionString(value: string | undefined) {
  if (!value) return value;
  try {
    const url = new URL(value);
    const mode = url.searchParams.get("sslmode");
    if (url.searchParams.get("uselibpqcompat") !== "true" && mode && ["prefer", "require", "verify-ca"].includes(mode)) {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch { /* Let the database driver report invalid connection strings. */ }
  return value;
}
