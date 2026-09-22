// History queries must not occupy the serial live-status WebSocket. UI reads
// use independent HTTP requests so changing pages never waits behind a chart.
export function useIndependentHTTP(method: string): boolean {
  return method === "public:queryMetrics" ||
    method === "public:getPingMetricStats" ||
    method === "common:getRecords" ||
    /^admin:(get|list|query)/.test(method);
}
