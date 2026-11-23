import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import { createLocaliser } from '@wwd/client-core';
import App from './App.svelte';
import { prepareDevice } from './device.js';
import { loadEngine } from './engine.js';
import { installBaseDevHook } from './dev-hook.js';
import { listenForInstall } from './pwa/install.js';
import { watchForUpdates } from './pwa/update.js';
import './theme/tokens.css';
import './theme/base.css';

installBaseDevHook();
listenForInstall();
watchForUpdates(registerSW);
const localiser = createLocaliser('en');
document.title = localiser.t('app-title');
const target = document.getElementById('app');

if (target !== null) {
  Promise.all([loadEngine(), prepareDevice(document.documentElement)]).then(
    () => mount(App, { target, props: { localiser } }),
    () => {
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = localiser.t('app-load-failed');
      target.replaceChildren(message);
    },
  );
}
