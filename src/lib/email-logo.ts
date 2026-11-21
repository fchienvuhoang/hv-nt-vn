import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {cloudflareContext} from "./cloudflare-context";
import { EMAIL_LOGO_CID } from "./email-template";

export async function emailLogoAttachments() {
  const assets=cloudflareContext()?.env.ASSETS;
  let logo:Buffer;
  if(assets){
    const response=await assets.fetch("https://assets.internal/branding/hoc-vien-nguyen-thuy-viet-nam.png");
    if(!response.ok)throw new Error("Email logo asset unavailable");
    logo=Buffer.from(await response.arrayBuffer());
  }else logo=await readFile(path.join(process.cwd(), "public/branding/hoc-vien-nguyen-thuy-viet-nam.png"));
  return [{ ContentType: "image/png", Filename: "hoc-vien-nguyen-thuy-viet-nam.png", ContentID: EMAIL_LOGO_CID, Base64Content: logo.toString("base64") }];
}
