import type { ServiceConfig } from './service.js';

const LOCALHOST_ORIGIN = /^http:\/\/localhost(:\d+)?$/;

/** Whether a browser origin may call the service. */
export function isOriginAllowed(origin: string, config: ServiceConfig): boolean {
  if (config.allowedOrigins.includes(origin)) return true;
  return config.testOverrides && LOCALHOST_ORIGIN.test(origin);
}

/** CORS response headers for a request origin; an allowed origin is echoed back. */
export function corsHeaders(origin: string | null, config: ServiceConfig): Headers {
  const headers = new Headers();
  headers.set('vary', 'Origin');
  if (origin !== null && isOriginAllowed(origin, config)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type');
    headers.set('access-control-max-age', '600');
  }
  return headers;
}
