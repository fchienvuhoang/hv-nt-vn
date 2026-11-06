import assert from "node:assert/strict";
import test from "node:test";
import { assignTransaction } from "../src/lib/admin-api";

test("successful REST saves resolve before a coalesced background refresh; errors never refresh", async () => {
  const originalFetch = globalThis.fetch;
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const channelDescriptor = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
  const events = new EventTarget(), order: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined });
  events.addEventListener("admin:data-changed", () => order.push("refresh"));
  const nextTask = () => new Promise(resolve => setTimeout(resolve, 10));
  try {
    globalThis.fetch = async () => Response.json({ success: "Đã gán" });
    const first = await assignTransaction({}, new FormData());
    assert.equal(first.success, "Đã gán");
    order.push("close-first");
    const second = await assignTransaction({}, new FormData());
    assert.equal(second.success, "Đã gán");
    order.push("close-second");
    assert.deepEqual(order, ["close-first", "close-second"]);
    await nextTask();
    assert.deepEqual(order, ["close-first", "close-second", "refresh"]);

    for (const result of [{ error: "Tài khoản không hợp lệ" }, { fieldErrors: { fundId: ["Chọn thiện pháp"] } }]) {
      globalThis.fetch = async () => Response.json(result);
      await assignTransaction({}, new FormData());
    }
    globalThis.fetch = async () => { throw new Error("Offline"); };
    assert.ok((await assignTransaction({}, new FormData())).error);
    await nextTask();
    assert.deepEqual(order, ["close-first", "close-second", "refresh"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (channelDescriptor) Object.defineProperty(globalThis, "BroadcastChannel", channelDescriptor);
    else Reflect.deleteProperty(globalThis, "BroadcastChannel");
  }
});
