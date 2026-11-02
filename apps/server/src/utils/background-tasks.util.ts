// Side effects that run after the HTTP response (e.g. notification emails) register here,
// so graceful shutdown can wait for them instead of dropping them mid-send.
const pending = new Set<Promise<void>>();

/** Track a fire-and-forget task; its rejection is swallowed here (callers log their own errors). */
export function trackBackgroundTask(task: Promise<unknown>): void {
  const tracked: Promise<void> = task
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      pending.delete(tracked);
    });
  pending.add(tracked);
}

export function pendingBackgroundTaskCount(): number {
  return pending.size;
}

/** Resolves true when every tracked task settled, false if the timeout expired first. */
export async function drainBackgroundTasks(timeoutMs: number): Promise<boolean> {
  if (pending.size === 0) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
  });
  // Tasks registered while draining are included by re-checking until the set is empty.
  const settled = (async () => {
    while (pending.size > 0) await Promise.allSettled([...pending]);
    return true as const;
  })();
  try {
    return await Promise.race([settled, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
