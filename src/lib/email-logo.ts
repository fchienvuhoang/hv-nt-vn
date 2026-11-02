import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { EMAIL_LOGO_CID } from "./email-template";

export async function emailLogoAttachments() {
  const logo = await readFile(path.join(process.cwd(), "public/branding/hoc-vien-nguyen-thuy-viet-nam.png"));
  return [{ ContentType: "image/png", Filename: "hoc-vien-nguyen-thuy-viet-nam.png", ContentID: EMAIL_LOGO_CID, Base64Content: logo.toString("base64") }];
}
