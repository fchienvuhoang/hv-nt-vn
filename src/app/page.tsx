import { redirect } from "next/navigation";

export default function EntryPage() {
  // The admin layout checks the current session and redirects guests to login.
  redirect("/admin");
}
