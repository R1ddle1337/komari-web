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

test("compact metric transport preserves samples and accepts older servers", async () => {
  const { decodeMetricResponse } = await import("../src/lib/metricWire.ts");
  const tags = { task_id: "17" };
  const input = {series:[{metric_key:"ping.latency_ms",entity_id:"node",tags,point_format:"points_v1",points:[[1700000000123,1.2345678901234567,9],[1700000001123,null,0],[1700000002123,-1,3,{device:'GPU <0>'}]]}]};
  const result = decodeMetricResponse(input);
  assert.deepEqual(result.series[0].points.map(p=>[Date.parse(p.time),p.value,p.count]),input.series[0].points.map(p=>p.slice(0,3)));
  assert.equal(result.series[0].points[0].tags,tags);
  assert.deepEqual(result.series[0].points[2].labels,{device:'GPU <0>'});
  assert.ok(Array.isArray(input.series[0].points[0]),"decoding must not mutate the transport payload");
  const legacy={series:[{points:[{time:'2026-01-01T00:00:00Z',value:3}]}]};
  assert.equal(decodeMetricResponse(legacy),legacy);
  for(const bad of [[NaN,1,1],[1700000000000,Infinity,1],[1700000000000,1,-1],[1700000000000,1]]){
    assert.throws(()=>decodeMetricResponse({series:[{point_format:'points_v1',points:[bad]}]}),/Invalid compact metric sample/);
  }
});
