// Bound the complete response (including its body), so a stalled edge request
// cannot leave account/public settings screens in Loading indefinitely.
import { requestAbort } from "./requestAbort.ts";

export async function fetchJSON<T>(url: string, timeout = 12000, signal?: AbortSignal): Promise<T> {
  const request = requestAbort(timeout, signal);
  try {
    const response = await fetch(url, { signal: request.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed: HTTP ${response.status}`);
    return await response.json() as T;
  } catch (error) {
    if (request.signal.aborted && !signal?.aborted) throw new Error("Request timed out. Please retry.");
    throw error;
  } finally {
    request.clear();
  }
}
