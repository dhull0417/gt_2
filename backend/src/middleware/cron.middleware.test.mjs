// Run with: npm test (from backend/)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const { protectCron } = await import("./cron.middleware.js");

const saved = process.env.CRON_SECRET;
beforeEach(() => { process.env.CRON_SECRET = "s3cret"; });
afterEach(() => { process.env.CRON_SECRET = saved; if (saved === undefined) delete process.env.CRON_SECRET; });

const run = async (authorization) => {
  let nextCalled = false;
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  const origWarn = console.warn; const origErr = console.error;
  console.warn = () => {}; console.error = () => {};
  try { await protectCron({ headers: authorization === undefined ? {} : { authorization } }, res, () => { nextCalled = true; }); }
  finally { console.warn = origWarn; console.error = origErr; }
  return { nextCalled, res };
};

test("protectCron lets the right bearer secret through", async () => {
  const { nextCalled, res } = await run("Bearer s3cret");
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("protectCron rejects wrong, missing, and length-mismatched secrets with 401", async () => {
  for (const header of ["Bearer nope", "Bearer s3cret2", "Bearer ", "Bearer", undefined]) {
    const { nextCalled, res } = await run(header);
    assert.equal(nextCalled, false, String(header));
    assert.equal(res.statusCode, 401, String(header));
  }
});

test("protectCron returns 500 when CRON_SECRET isn't configured", async () => {
  delete process.env.CRON_SECRET;
  const { nextCalled, res } = await run("Bearer anything");
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 500);
});
