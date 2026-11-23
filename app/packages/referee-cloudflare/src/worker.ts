import wasm from '@wwd/engine/wasm';
import { engineVersion, initEngine } from '@wwd/engine';
import type { Clock, Random } from '@wwd/referee-core';
import {
  createRoomLimiter,
  errorReason,
  errorResponse,
  handleHttp,
  rateLimitKey,
  type ServiceConfig,
} from '@wwd/referee-service';
import { DurableRoomStore } from './do-store.js';

export { RoomObject } from './room-object.js';

export interface Env {
  ROOMS: DurableObjectNamespace;
  /** Comma-separated browser origins allowed to call the API. */
  ALLOWED_ORIGINS: string;
  /** `"1"` honours `test` room options and allows `http://localhost:*` origins. */
  TEST_OVERRIDES: string;
}

const clock: Clock = { now: () => Date.now() };
const random: Random = { bytes: (n) => crypto.getRandomValues(new Uint8Array(n)) };
// Each isolate counts on its own, so the limit holds per isolate rather than globally.
const limiter = createRoomLimiter(clock);

function configOf(env: Env): ServiceConfig {
  return {
    allowedOrigins: env.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
    testOverrides: env.TEST_OVERRIDES === '1',
    engineVersion: engineVersion(),
  };
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      await initEngine(wasm);
      const store = new DurableRoomStore(env.ROOMS);
      const result = await handleHttp(request, {
        store,
        config: configOf(env),
        limiter,
        clientIp: rateLimitKey(request.headers.get('CF-Connecting-IP') ?? 'unknown'),
        random,
      });
      if (result instanceof Response) return result;
      return await store.connect(result.upgrade, request);
    } catch (thrown) {
      console.error(`request failed: ${errorReason(thrown)}`);
      return errorResponse(500, 'internal_error');
    }
  },
} satisfies ExportedHandler<Env>;
