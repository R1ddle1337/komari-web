// Share only simultaneous reads. Settled values are never cached, and writes
// invalidate the pending reference so the next reader cannot join an old read.
export function singleFlight<T>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  return {
    read(): Promise<T> {
      if (!pending) {
        const request = Promise.resolve().then(load).finally(() => {
          if (pending === request) pending = undefined;
        });
        pending = request;
      }
      return pending;
    },
    invalidate() { pending = undefined; },
  };
}
