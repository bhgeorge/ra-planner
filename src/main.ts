import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './app.css';
import { toasts } from './lib/toast.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

mount(App, { target });

let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;

updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    toasts.show({
      message: 'Update available — reload to get the latest checklists.',
      kind: 'info',
      duration: Infinity,
      action: {
        label: 'Reload',
        onClick: async () => {
          await updateServiceWorker?.(true);
        },
      },
    });
  },
  onOfflineReady() {
    toasts.show({
      message: 'Ready to work offline.',
      kind: 'success',
      duration: 4000,
    });
  },
});
