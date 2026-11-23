type WorkerEnv = import('../src/worker.js').Env;

declare namespace Cloudflare {
  interface Env extends WorkerEnv {}
}
