import type { Seat } from '@wwd/engine';

/**
 * A room's pause: the seat that asked for one, whether the other seat agreed, whether and when
 * it applied, and which seats have since asked to resume.
 */
export interface Pause {
  readonly requestedBy: Seat | null;
  readonly agreed: boolean;
  readonly paused: boolean;
  /** When the pause applied, in epoch milliseconds, or `null` while it has not. */
  readonly pausedAt: number | null;
  readonly resumeReady: readonly Seat[];
}

/** Why a pause message cannot change the pause. */
export type PauseRefusal = 'paused' | 'invalid_message';

export const NOT_PAUSED: Pause = {
  requestedBy: null,
  agreed: false,
  paused: false,
  pausedAt: null,
  resumeReady: [],
};

/** Asks for a pause; a request from the seat that did not ask first agrees to it. */
export function request(pause: Pause, seat: Seat): Pause | PauseRefusal {
  if (pause.paused) return 'paused';
  if (pause.requestedBy === null) return { ...pause, requestedBy: seat };
  if (pause.requestedBy === seat || pause.agreed) return pause;
  return { ...pause, agreed: true };
}

/** Agrees to the other seat's request. */
export function accept(pause: Pause, seat: Seat): Pause | PauseRefusal {
  if (pause.paused) return 'paused';
  if (pause.requestedBy === null || pause.requestedBy === seat) return 'invalid_message';
  return pause.agreed ? pause : { ...pause, agreed: true };
}

/** Withdraws the request and any agreement to it. */
export function cancel(pause: Pause): Pause | PauseRefusal {
  if (pause.paused) return 'paused';
  return pause.requestedBy === null ? pause : NOT_PAUSED;
}

/** True when an agreed pause is waiting for a round boundary to apply. */
export function isDue(pause: Pause): boolean {
  return pause.agreed && !pause.paused;
}

export function applied(pause: Pause, at: number): Pause {
  return { ...pause, paused: true, pausedAt: at, resumeReady: [] };
}

/** Records that `seat` asked to resume the paused game. */
export function ready(pause: Pause, seat: Seat): Pause | PauseRefusal {
  if (!pause.paused) return 'invalid_message';
  if (pause.resumeReady.includes(seat)) return pause;
  const resumeReady = (['p0', 'p1'] as const).filter(
    (s) => s === seat || pause.resumeReady.includes(s),
  );
  return { ...pause, resumeReady };
}

/** Forgets that `seat` asked to resume. */
export function unready(pause: Pause, seat: Seat): Pause {
  if (!pause.resumeReady.includes(seat)) return pause;
  return { ...pause, resumeReady: pause.resumeReady.filter((s) => s !== seat) };
}

export function bothReady(pause: Pause): boolean {
  return pause.paused && pause.resumeReady.length === 2;
}
