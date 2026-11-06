<script lang="ts">
  import { onMount } from 'svelte';
  import PageHeader from '$components/PageHeader.svelte';
  import { shareBackup } from '$lib/backup';
  import { checklists, checklistVersions } from '$lib/checklists';
  import { raStore } from '$lib/ra/store.svelte';
  import { maskApiKey } from '$lib/ra/api';
  import { AppStateSchema } from '$lib/schema';
  import { PERSIST_REQUESTED_KEY } from '$lib/state';
  import { appStore } from '$lib/store.svelte';
  import { toasts } from '$lib/toast.svelte';
  import { loadTextToggles, saveTextToggles } from '$lib/prefs';

  let username = $state('');
  let apiKey = $state('');
  let editingKey = $state(false);
  let textToggles = $state(true);
  let raTestMessage = $state('');
  let raTestError = $state(false);
  let persistentStorage = $state(false);
  let importInput = $state<HTMLInputElement | null>(null);

  const testTarget = $derived(checklists.find((checklist) => checklist.raGameId));

  onMount(() => {
    const credentials = raStore.credentials;
    if (credentials) {
      username = credentials.username;
      apiKey = credentials.apiKey;
    }
    textToggles = loadTextToggles();
    try {
      persistentStorage = localStorage.getItem(PERSIST_REQUESTED_KEY) === '1';
    } catch {
      persistentStorage = false;
    }
  });

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

  async function shareStateBackup(): Promise<void> {
    try {
      const result = await shareBackup(appStore.state);
      if (result === 'shared') {
        toasts.show({ message: 'Backup shared.', kind: 'success', duration: 3000 });
      } else if (result === 'downloaded') {
        toasts.show({
          message: 'Backup downloaded. Sharing files is not available in this browser.',
          kind: 'success',
          duration: 5000,
        });
      }
    } catch {
      toasts.show({ message: 'Could not prepare a backup.', kind: 'error' });
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
  <PageHeader title="Settings" subtitle="Achievements and data" back />

  <section class="settings-section" aria-labelledby="ra-heading">
    <div class="section-heading">
      <h2 id="ra-heading">RetroAchievements</h2>
    </div>
    <p class="settings-note">
      Credentials are stored on this device only. They are never uploaded, never logged,
      and never included in backups.
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
      On Android, <strong>Share backup</strong> opens the system share sheet so you can send
      the JSON file to Drive or any other app. Import merges a backup, so it never erases
      newer checks.
    </p>
    <div class="button-row">
      <button type="button" class="secondary-button" onclick={shareStateBackup}>
        Share backup (JSON)
      </button>
      <button type="button" class="secondary-button" onclick={openImport}>
        Import backup (JSON)
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
