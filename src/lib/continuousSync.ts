/** Coalesce edits while serializing requests. A change during a request gets a new pass. */
export function continuousSync(run: () => Promise<void>, onError: (error: unknown) => void,
  options: { delay?: number; interval?: number; retryDelay?: number } = {}) {
  const delay = options.delay ?? 500;
  let stopped = false, running = false, requested = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryAt = 0, failures = 0;
  async function drain() {
    if (stopped || running) return;
    if (Date.now() < retryAt) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; void drain(); }, retryAt - Date.now());
      return;
    }
    running = true;
    try {
      while (requested && !stopped) {
        requested = false;
        try { await run(); failures = 0; retryAt = 0; } catch (error) {
          failures++;
          const limited = typeof error === 'object' && error !== null && 'status' in error && error.status === 429;
          retryAt = Date.now() + (limited ? 60000 : Math.min(60000, (options.retryDelay ?? 3000) * 2 ** Math.min(failures - 1, 5)));
          requested = true;
          if (!stopped) { onError(error); timer = setTimeout(() => { timer = undefined; void drain(); }, retryAt - Date.now()); }
          break;
        }
      }
    } finally { running = false; }
  }
  function request(immediate = false) {
    if (stopped) return;
    requested = true;
    if (timer) clearTimeout(timer);
    if (immediate) void drain();
    else timer = setTimeout(() => { timer = undefined; void drain(); }, delay);
  }
  const poll = setInterval(() => { if (!running) request(true); }, options.interval ?? 3000);
  return { request, stop() { stopped = true; clearInterval(poll); if (timer) clearTimeout(timer); } };
}
