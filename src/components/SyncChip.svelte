<script lang="ts">
  import { syncManager } from '$lib/sync/manager.svelte';

  const label = $derived.by(() => {
    switch (syncManager.status) {
      case 'syncing':
        return 'Syncing…';
      case 'synced': {
        const time = syncManager.lastSyncedAt
          ? new Date(syncManager.lastSyncedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';
        return time ? `Synced ${time}` : 'Synced';
      }
      case 'offline':
        return 'Offline';
      case 'signed-out':
        return 'Not signed in';
      case 'error':
        return 'Sync failed';
      default:
        return 'Sync ready';
    }
  });

  const title = $derived(
    syncManager.lastSyncedAt
      ? `Last synced ${new Date(syncManager.lastSyncedAt).toLocaleString()}`
      : 'Open Settings to configure sync',
  );
</script>

<a
  class="sync-chip sync-{syncManager.status}"
  href="#/settings"
  {title}
  aria-label="Sync status: {label}. Open settings."
>
  <span class="sync-dot" aria-hidden="true"></span>
  <span>{label}</span>
</a>
