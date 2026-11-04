<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$components/PageHeader.svelte';
  import { checklists, checklistVersions } from '$lib/checklists';
  import { raStore } from '$lib/ra/store.svelte';
  import { maskApiKey } from '$lib/ra/api';
  import { AppStateSchema } from '$lib/schema';
  import { loadSyncMeta, PERSIST_REQUESTED_KEY } from '$lib/state';
  import { appStore } from '$lib/store.svelte';
  import {
    getEmail,
    hasClientId,
    signIn,
    signOut,
    wasSignedIn,
  } from '$lib/sync/auth';
  import { syncManager } from '$lib/sync/manager.svelte';
  import { toasts } from '$lib/toast.svelte';
  import { loadTextToggles, saveTextToggles } from '$lib/prefs';

  let username = $state('');
  let apiKey = $state('');
  let editingKey = $state(false);
  let signedIn = $state(false);
  let email = $state<string | null>(null);
  let textToggles = $state(true);
  let raTestMessage = $state('');
  let raTestError = $state(false);
  let driveFileId = $state<string | null>(null);
  let persistentStorage = $state(false);
  let importInput = $state<HTMLInputElement | null>(null);

  const googleConfigured = hasClientId();
  const testTarget = $derived(checklists.find((checklist) => checklist.raGameId));

  const syncStatusText = $derived.by(() => {
    switch (syncManager.status) {
      case 'syncing':
        return 'Syncing…';
      case 'synced':
        return 'Synced';
      case 'offline':
        return 'Offline — changes will sync when you reconnect.';
      case 'signed-out':
        return signedIn ? 'Session expired — sign in again.' : 'Not signed in.';
      case 'error':
        return 'Last sync failed.';
      default:
        return signedIn ? 'Ready to sync.' : 'Not signed in.';
    }
  });

  const lastSyncedText = $derived(
    syncManager.lastSyncedAt
      ? new Date(syncManager.lastSyncedAt).toLocaleString()
      : 'Never',
  );

  onMount(() => {
    const credentials = raStore.credentials;
    if (credentials) {
      username = credentials.username;
      apiKey = credentials.apiKey;
    }
    signedIn = wasSignedIn();
    email = getEmail();
    textToggles = loadTextToggles();
    driveFileId = loadSyncMeta().fileId;
    try {
      persistentStorage = localStorage.getItem(PERSIST_REQUESTED_KEY) === '1';
    } catch {
      persistentStorage = false;
    }
  });

  function refreshAuthState(): void {
    signedIn = wasSignedIn();
    email = getEmail();
    driveFileId = loadSyncMeta().fileId;
  }

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async function handleSignIn(): Promise<void> {
    try {
      await signIn();
      refreshAuthState();
      syncManager.markSignedIn();
      toasts.show({ message: 'Signed in to Google.', kind: 'success' });
      await syncManager.syncNow('manual', { interactive: true });
      refreshAuthState();
      if (syncManager.error) {
        toasts.show({ message: syncManager.error, kind: 'error', duration: 8000 });
      }
    } catch (error) {
      toasts.show({ message: errorMessage(error), kind: 'error', duration: 8000 });
    }
  }

  function handleSignOut(): void {
    signOut();
    signedIn = false;
    email = null;
    driveFileId = null;
    syncManager.markSignedOut();
    toasts.show({ message: 'Signed out of Google.', kind: 'info' });
  }

  async function handleSyncNow(): Promise<void> {
    try {
      if (!signedIn) {
        await signIn();
        refreshAuthState();
        syncManager.markSignedIn();
      }
      const ok = await syncManager.syncNow('manual', { interactive: true });
      refreshAuthState();
      if (ok) {
        toasts.show({ message: 'Sync complete.', kind: 'success', duration: 3000 });
      } else if (syncManager.error) {
        toasts.show({ message: syncManager.error, kind: 'error', duration: 8000 });
      }
    } catch (error) {
      toasts.show({ message: errorMessage(error), kind: 'error', duration: 8000 });
    }
  }

  function persistRa(showToast = true): boolean {
    if (!username.trim() || !apiKey.trim()) {
      toasts.show({
        message: 'Enter both a RetroAchievements username and Web API key.',
        kind: 'warning',
      });
      return false;
    }
    try {
      raStore.saveCredentials({ username, apiKey });
      username = username.trim();
      apiKey = apiKey.trim();
      editingKey = false;
      if (showToast) {
        toasts.show({
          message: 'RetroAchievements credentials saved on this device.',
          kind: 'success',
          duration: 3000,
        });
      }
      return true;
    } catch {
      toasts.show({
        message: 'Could not save credentials; browser storage may be unavailable.',
        kind: 'error',
      });
      return false;
    }
  }

  async function testRa(): Promise<void> {
    if (!testTarget?.raGameId) {
      toasts.show({
        message: 'Add a checklist with an raGameId before testing the connection.',
        kind: 'warning',
      });
      return;
    }
    if (!persistRa(false)) return;

    raTestMessage = 'Testing connection…';
    raTestError = false;
    try {
      const data = await raStore.testConnection(testTarget.raGameId);
      raTestMessage = `Connected. ${data.title}: ${data.numAwarded}/${data.numAchievements} achievements earned.`;
      raTestError = false;
      toasts.show({ message: 'RetroAchievements connection works.', kind: 'success' });
    } catch (error) {
      raTestMessage = errorMessage(error);
      raTestError = true;
      toasts.show({ message: errorMessage(error), kind: 'error', duration: 8000 });
    }
  }

  function clearRa(): void {
    raStore.removeCredentials();
    username = '';
    apiKey = '';
    editingKey = false;
    raTestMessage = '';
    toasts.show({ message: 'RetroAchievements credentials removed.', kind: 'info' });
  }

  function updateTextToggles(value: boolean): void {
    textToggles = value;
    saveTextToggles(value);
  }

  function exportState(): void {
    try {
      const blob = new Blob([JSON.stringify(appStore.state, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ra-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toasts.show({ message: 'State exported.', kind: 'success', duration: 3000 });
    } catch {
      toasts.show({ message: 'Could not export state.', kind: 'error' });
    }
  }

  async function importState(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        toasts.show({ message: 'That file is not valid JSON.', kind: 'error' });
        return;
      }

      const parsed = AppStateSchema.safeParse(raw);
      if (!parsed.success) {
        toasts.show({
          message: 'That file is not a valid RA Planner state export.',
          kind: 'error',
        });
        return;
      }

      appStore.importState(parsed.data);
      toasts.show({
        message: 'Imported. Local and imported progress were merged.',
        kind: 'success',
        duration: 5000,
      });
    } catch {
      toasts.show({ message: 'Could not read that file.', kind: 'error' });
    }
  }

  function openImport(): void {
    importInput?.click();
  }
</script>

<svelte:head>
  <title>Settings · RA Planner</title>
</svelte:head>

<div class="page settings-page">
  <PageHeader title="Settings" subtitle="Sync, achievements, and data" back />

  <section class="settings-section" aria-labelledby="sync-heading">
    <div class="section-heading">
      <h2 id="sync-heading">Google Drive sync</h2>
      <span class="status-pill status-{syncManager.status}">{syncStatusText}</span>
    </div>

    {#if !googleConfigured}
      <p class="callout callout-warning">
        Google sync is not configured in this build. Set
        <code>VITE_GOOGLE_CLIENT_ID</code> before building. The app still works locally.
      </p>
    {/if}

    {#if signedIn}
      <p class="settings-line">
        Signed in as <strong>{email ?? 'Google account'}</strong>
      </p>
      <div class="button-row">
        <button
          type="button"
          class="secondary-button"
          onclick={handleSyncNow}
          disabled={syncManager.status === 'syncing'}
        >
          {syncManager.status === 'syncing' ? 'Syncing…' : 'Sync now'}
        </button>
        <button type="button" class="secondary-button" onclick={handleSignOut}>
          Sign out
        </button>
      </div>
    {:else}
      <p class="settings-line">
        State syncs through a single hidden file in your Google Drive app data folder.
      </p>
      <div class="button-row">
        <button
          type="button"
          class="primary-button"
          onclick={handleSignIn}
          disabled={!googleConfigured}
        >
          Sign in with Google
        </button>
        <button
          type="button"
          class="secondary-button"
          onclick={handleSyncNow}
          disabled={!googleConfigured || syncManager.status === 'syncing'}
        >
          Sync now
        </button>
      </div>
    {/if}

    <dl class="facts">
      <div><dt>Last synced</dt><dd>{lastSyncedText}</dd></div>
      <div><dt>Status</dt><dd>{syncStatusText}</dd></div>
      {#if driveFileId}
        <div><dt>Drive file ID</dt><dd class="mono">{driveFileId}</dd></div>
      {/if}
    </dl>

    {#if syncManager.error}
      <details class="error-details">
        <summary>Error details</summary>
        <pre>{syncManager.error}</pre>
      </details>
    {/if}
  </section>

  <section class="settings-section" aria-labelledby="ra-heading">
    <div class="section-heading">
      <h2 id="ra-heading">RetroAchievements</h2>
    </div>
    <p class="settings-note">
      Credentials are stored on this device only. They are never sent to Drive, never logged,
      and never included in state exports.
    </p>

    <label class="field">
      <span>Username</span>
      <input
        type="text"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        bind:value={username}
        placeholder="Your RA username"
      />
    </label>

    <div class="field">
      <span>Web API key</span>
      {#if raStore.hasCredentials && !editingKey}
        <div class="masked-key">
          <span class="mono">{maskApiKey(apiKey)}</span>
          <button type="button" class="text-button" onclick={() => (editingKey = true)}>
            Change
          </button>
        </div>
      {:else}
        <input
          type="password"
          autocomplete="off"
          spellcheck="false"
          bind:value={apiKey}
          placeholder="Paste your key from retroachievements.org/controlpanel.php"
        />
      {/if}
    </div>

    <div class="button-row">
      <button type="button" class="primary-button" onclick={() => persistRa(true)}>
        Save credentials
      </button>
      <button type="button" class="secondary-button" onclick={testRa}>
        Test connection
      </button>
      {#if raStore.hasCredentials}
        <button type="button" class="text-button danger-text" onclick={clearRa}>
          Remove
        </button>
      {/if}
    </div>

    {#if raTestMessage}
      <p class="test-result" class:error={raTestError}>{raTestMessage}</p>
    {/if}
    {#if !testTarget}
      <p class="settings-note">
        Add an <code>raGameId</code> to a checklist to test the connection.
      </p>
    {:else}
      <p class="settings-note">
        Test uses <strong>{testTarget.title}</strong> (RA game {testTarget.raGameId}).
        {#if raStore.proxyConfigured}
          A CORS proxy is configured for this build.
        {:else}
          Requests go directly to retroachievements.org.
        {/if}
      </p>
    {/if}
  </section>

  <section class="settings-section" aria-labelledby="data-heading">
    <div class="section-heading">
      <h2 id="data-heading">Data</h2>
    </div>
    <p class="settings-note">
      Back up check state manually, or merge an export from another device. Import merges,
      so it never erases newer checks.
    </p>
    <div class="button-row">
      <button type="button" class="secondary-button" onclick={exportState}>
        Export state (JSON)
      </button>
      <button type="button" class="secondary-button" onclick={openImport}>
        Import state (JSON)
      </button>
      <input
        class="visually-hidden"
        type="file"
        accept=".json,application/json"
        bind:this={importInput}
        onchange={importState}
      />
    </div>
  </section>

  <section class="settings-section" aria-labelledby="behavior-heading">
    <div class="section-heading">
      <h2 id="behavior-heading">Behavior</h2>
    </div>
    <label class="switch-row">
      <input
        type="checkbox"
        checked={textToggles}
        onchange={(event) => updateTextToggles(event.currentTarget.checked)}
      />
      <span>
        <strong>Tapping a step's text toggles it</strong>
        <small>Turn this off if you only want the checkbox to toggle steps.</small>
      </span>
    </label>
  </section>

  <section class="settings-section" aria-labelledby="about-heading">
    <div class="section-heading">
      <h2 id="about-heading">About</h2>
    </div>
    <p class="settings-line">RA Planner v{__APP_VERSION__}</p>
    <ul class="version-list">
      {#each checklistVersions as entry (entry.slug)}
        <li>
          <span>{entry.title}</span>
          <span class="mono">v{entry.version}</span>
        </li>
      {/each}
    </ul>
    <p class="settings-note">
      Persistent storage requested: {persistentStorage ? 'yes' : 'not yet'}.
    </p>
  </section>
</div>
