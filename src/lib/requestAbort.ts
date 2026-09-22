// Keep cancellation working in browsers without AbortSignal.any/timeout.
export function requestAbort(timeout: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, timeout);
  if (parent?.aborted) cancel();
  else parent?.addEventListener("abort", cancel, { once: true });
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", cancel);
    },
  };
}
