import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { fetchJSON } from "../src/lib/fetchJSON.ts";
import { singleFlight } from "../src/lib/singleFlight.ts";
import { requestAbort } from "../src/lib/requestAbort.ts";

test("request cancellation follows the view lifetime and retains a timeout", async () => {
  const parent = new AbortController();
  const request = requestAbort(10000, parent.signal);
  parent.abort();
  assert.equal(request.signal.aborted, true);
  request.clear();
  const alreadyAborted = requestAbort(10000, parent.signal);
  assert.equal(alreadyAborted.signal.aborted, true);
  alreadyAborted.clear();
  const timed = requestAbort(10);
  await new Promise(resolve => timed.signal.addEventListener("abort", resolve, { once: true }));
  timed.clear();
  const settledParent = new AbortController();
  const settled = requestAbort(10000, settledParent.signal);
  settled.clear();
  settledParent.abort();
  assert.equal(settled.signal.aborted, false);
});

test("settings reads coalesce, retry failures, and do not reuse pre-write requests", async () => {
  const resolvers = [];
  const reader = singleFlight(() => new Promise((resolve, reject) => resolvers.push({resolve, reject})));
  const first = reader.read();
  assert.equal(reader.read(), first);
  await Promise.resolve();
  assert.equal(resolvers.length, 1);
  reader.invalidate();
  const second = reader.read();
  await Promise.resolve();
  resolvers[0].resolve("old");
  assert.equal(await first, "old");
  assert.equal(reader.read(), second);
  resolvers[1].resolve("new");
  assert.equal(await second, "new");
  const failure = reader.read();
  await Promise.resolve();
  resolvers[2].reject(new Error("offline"));
  await assert.rejects(failure, /offline/);
  const retry = reader.read();
  await Promise.resolve();
  resolvers[3].resolve("recovered");
  assert.equal(await retry, "recovered");
});

test("account requests finish or fail even when a response body stalls", async (t) => {
  const server = createServer((req, res) => {
    if (req.url === "/stall") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"logged_in":');
    } else if (req.url === "/error") {
      res.writeHead(503).end("unavailable");
    } else {
      res.setHeader("Content-Type", "application/json");
      res.end('{"logged_in":false}');
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await fetchJSON(base), { logged_in: false });
  await assert.rejects(fetchJSON(`${base}/error`), /HTTP 503/);
  await assert.rejects(fetchJSON(`${base}/stall`, 100), /timed out/);
});
