import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { prepareDevice } from './device.js';
import { loadEngine } from './engine.js';
import { installBaseDevHook } from './dev-hook.js';
import { listenForInstall } from './pwa/install.js';
import { activeLocaliser, languageSettled } from './settings/language.svelte.js';
import { watchForUpdates } from './pwa/update.js';
import './theme/tokens.css';
import './theme/base.css';

installBaseDevHook();
listenForInstall();
watchForUpdates(registerSW);
const target = document.getElementById('app');

if (target !== null) {
  // The chosen language's text is in before the first screen is drawn.
  Promise.all([loadEngine(), prepareDevice(document.documentElement).then(languageSettled)]).then(
    () => mount(App, { target }),
    () => {
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = activeLocaliser().t('app-load-failed');
      target.replaceChildren(message);
    },
  );
}
