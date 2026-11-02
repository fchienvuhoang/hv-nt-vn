import { test } from "node:test";
import assert from "node:assert/strict";
import { databaseConnectionString } from "../src/lib/database-url";

test("deprecated SSL aliases keep full certificate verification and all other connection settings", () => {
  for (const mode of ["prefer", "require", "verify-ca"]) {
    const input = `postgresql://user:p%40ss@example.test/db?sslmode=${mode}&application_name=test`;
    const output = new URL(databaseConnectionString(input)!);
    assert.equal(output.searchParams.get("sslmode"), "verify-full");
    assert.equal(output.password, "p%40ss");
    assert.equal(output.searchParams.get("application_name"), "test");
  }
});

test("explicit libpq behavior, unencrypted local connections and invalid URLs stay unchanged", () => {
  for (const input of [undefined, "", "not-a-url", "postgresql://localhost/db", "postgresql://localhost/db?sslmode=disable", "postgresql://example.test/db?sslmode=require&uselibpqcompat=true", "postgresql://example.test/db?sslmode=verify-full"]) assert.equal(databaseConnectionString(input), input);
});
