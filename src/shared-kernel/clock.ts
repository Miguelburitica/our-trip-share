/** Port: domain code never calls Date.now() directly. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(start: Date | string): Clock & { advance(ms: number): void; set(d: Date | string): void } {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
    set: (d) => {
      current = new Date(d);
    },
  };
}

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
