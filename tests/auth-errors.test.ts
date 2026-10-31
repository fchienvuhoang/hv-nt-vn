import test from "node:test";
import assert from "node:assert/strict";
import { authErrorMessage } from "../src/lib/auth-errors";
test("OAuth configuration failures are not presented as an email permission failure", () => {
  assert.match(authErrorMessage("Configuration")!, /AUTH_GOOGLE_SECRET/);
  assert.ok(!authErrorMessage("Configuration")!.includes("chưa được cấp quyền"));
  assert.match(authErrorMessage("AccessDenied")!, /ADMIN_EMAILS/);
});
test("unknown auth errors do not reflect arbitrary input and no-error pages stay quiet", () => {
  assert.equal(authErrorMessage(undefined), null);
  assert.ok(!authErrorMessage("sensitive-untrusted-error")!.includes("sensitive-untrusted-error"));
});
