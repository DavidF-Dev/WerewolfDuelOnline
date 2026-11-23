/** Fixed ports for the end-to-end configs, one app port and one referee port per config. */
export const PORTS = {
  onlineApp: 5198,
  onlineReferee: 8797,
  parityApp: 5197,
  parityReferee: 8798,
} as const;
