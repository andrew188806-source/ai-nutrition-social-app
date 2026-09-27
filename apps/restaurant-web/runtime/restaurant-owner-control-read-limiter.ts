// GQA-6R R-1: bounded request shape for the per-item owner control READS on the menu page.
//
// Each branch menu item mounts five read-only controls (sold-out, availability, price, visibility,
// display name), each issuing its own GET on mount. Four items fired ~20 simultaneous requests, and on
// the Development compute that many concurrent RLS-heavy definer RPCs each ran past the 8 s
// authenticated statement timeout (57014), surfacing as intermittent 503s — while any single read takes
// ~40 ms. The fix is the request SHAPE, not the timeout and not the database: at most
// OWNER_CONTROL_READ_MAX_IN_FLIGHT reads are in flight at once, the rest wait in FIFO order, and every
// caller still receives exactly its own response (or its own failure). Writes (POST) are not routed
// through here and are never delayed.

export const OWNER_CONTROL_READ_MAX_IN_FLIGHT = 4;

export type ConcurrencyLimiter = {
  run<T>(task: () => Promise<T>): Promise<T>;
  readonly inFlight: number;
  readonly queued: number;
};

export function createConcurrencyLimiter(maxInFlight: number): ConcurrencyLimiter {
  if (!Number.isInteger(maxInFlight) || maxInFlight < 1) throw new Error("maxInFlight must be a positive integer");
  let inFlight = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    inFlight -= 1;
    const next = queue.shift();
    if (next) next();
  };

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          inFlight += 1;
          let settled: Promise<T>;
          try {
            settled = Promise.resolve(task());
          } catch (error) {
            settled = Promise.reject(error);
          }
          // Free the slot before the caller continues, so the next queued read starts first.
          settled.finally(release).then(resolve, reject);
        };
        if (inFlight < maxInFlight) start();
        else queue.push(start);
      });
    },
    get inFlight() { return inFlight; },
    get queued() { return queue.length; }
  };
}

const ownerControlReadLimiter = createConcurrencyLimiter(OWNER_CONTROL_READ_MAX_IN_FLIGHT);

// Same signature as fetch; used only for the owner control preview GETs.
export function ownerControlReadFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return ownerControlReadLimiter.run(() => fetch(input, init));
}
