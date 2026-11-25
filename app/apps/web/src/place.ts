import type { Localiser } from '@wwd/client-core';

/** Where a game is played: online against a friend, or in two tabs of this browser. */
export type Place = 'online' | 'device';

/** The choices of where to play, online first. */
export const placeOptions = (l: Localiser): ReadonlyArray<{ value: Place; label: string }> => [
  { value: 'online', label: l.t('play-online') },
  { value: 'device', label: l.t('play-device') },
];
