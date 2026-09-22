import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { fetchJSON } from "../src/lib/fetchJSON.ts";

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
