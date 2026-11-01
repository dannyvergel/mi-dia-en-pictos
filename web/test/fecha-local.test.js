const test = require("node:test");
const assert = require("node:assert");
const { hoyLocal } = require("../api/_lib/http");

test("hoyLocal usa la fecha de Argentina, no la de UTC", () => {
  // 23:30 del 31/10 en Argentina = 02:30 UTC del 1/11
  assert.strictEqual(hoyLocal(new Date("2026-11-01T02:30:00Z")), "2026-10-31");
  assert.strictEqual(hoyLocal(new Date("2026-11-01T12:00:00Z")), "2026-11-01");
});
