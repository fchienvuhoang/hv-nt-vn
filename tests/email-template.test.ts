import { test } from "node:test";
import assert from "node:assert/strict";
import { brandedEmail, EMAIL_LOGO_CID } from "../src/lib/email-template";

test("email uses website branding, inline logo and raised amount before goal", () => {
  const email = brandedEmail({ label: "THÀNH TỰU", title: "TP01", paragraphs: ["Kính gửi quản trị viên"], metrics: [{ label: "Đã hùn phước", value: "154.000.000 ₫" }, { label: "Mục tiêu", value: "150.000.000 ₫" }], link: { label: "Xem thiện pháp", url: "https://example.test/t/tp01" } });
  assert.ok(email.HTMLPart.includes(`cid:${EMAIL_LOGO_CID}`));
  for (const color of ["#faf6f0", "#7b3040", "#412c2b", "#eadfd4"]) assert.ok(email.HTMLPart.includes(color));
  assert.ok(email.HTMLPart.indexOf("154.000.000") < email.HTMLPart.indexOf("150.000.000"));
  assert.match(email.TextPart, /https:\/\/example.test\/t\/tp01/);
});

test("email escapes fund content and omits unsafe links", () => {
  const email = brandedEmail({ label: "<test>", title: '<img src=x onerror="alert(1)">', paragraphs: ["<script>bad</script>"], link: { label: "Xem", url: "javascript:alert(1)" } });
  assert.ok(!email.HTMLPart.includes("<script>"));
  assert.ok(!email.HTMLPart.includes("javascript:"));
  assert.match(email.HTMLPart, /&lt;img/);
});
