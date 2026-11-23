/** Fixed ports for the end-to-end configs, one app port and one referee port per config. */
export const PORTS = {
  onlineApp: 5198,
  onlineReferee: 8797,
  parityApp: 5197,
  parityReferee: 8798,
  pwaApp: 5196,
  /** Nothing listens here, so the offline build can never reach a real referee. */
  pwaReferee: 8799,
} as const;
