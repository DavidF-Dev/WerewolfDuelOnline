import { mount } from 'svelte';
import { createLocaliser } from '@wwd/client-core';
import App from './App.svelte';
import { loadEngine } from './engine.js';
import { installBaseDevHook } from './dev-hook.js';
import { pruneOnlineSessions } from './session.js';
import './app.css';

pruneOnlineSessions();
installBaseDevHook();
const localiser = createLocaliser('en');
document.title = localiser.t('app-title');
const target = document.getElementById('app');

if (target !== null) {
  loadEngine().then(
    () => mount(App, { target, props: { localiser } }),
    () => {
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = localiser.t('app-load-failed');
      target.replaceChildren(message);
    },
  );
}
