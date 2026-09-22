// Bound the complete response (including its body), so a stalled edge request
// cannot leave account/public settings screens in Loading indefinitely.
export async function fetchJSON<T>(url: string, timeout = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed: HTTP ${response.status}`);
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Request timed out. Please retry.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
