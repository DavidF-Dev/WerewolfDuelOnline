export {
  GameClient,
  type ClientStatus,
  type GameClientOptions,
  type GameClientState,
  type OpponentState,
  type PauseState,
  type RejoinAttempt,
} from './game-client.js';
export {
  createLocaliser,
  isLocaleLoaded,
  loadLocale,
  localiserFromSources,
  LOCALES,
  type Locale,
  type LocaleSource,
  type Localiser,
  type MessageArgs,
  type Translator,
} from './i18n.js';
export {
  BARE,
  characterParts,
  GrammarError,
  listForm,
  type Article,
  type CharacterForm,
  type GrammaticalCase,
} from './grammar.js';
export {
  plainText,
  richMessage,
  type RichKind,
  type RichKinds,
  type MarkerId,
  type RichPart,
} from './rich-text.js';
export type { Readable } from './store.js';
export {
  CONNECT_TIMEOUT_MS,
  ConnectionManager,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  RECONNECT_BASE_MS,
  RECONNECT_JITTER,
  RECONNECT_MAX_MS,
  SERVER_UNAVAILABLE_AFTER_MS,
  TIMER_JUMP_MS,
  type ConnectionManagerOptions,
  type ConnectionPhase,
  type ConnectionState,
  type StopReason,
  type Timers,
} from './connection-manager.js';
export { browserLifecycle, type Lifecycle } from './lifecycle.js';
