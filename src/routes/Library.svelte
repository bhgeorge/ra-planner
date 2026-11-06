<script lang="ts">
  import PageHeader from '$components/PageHeader.svelte';
  import ProgressBar from '$components/ProgressBar.svelte';
  import { checklists } from '$lib/checklists';
  import { computeProgress } from '$lib/progress';
  import { appStore } from '$lib/store.svelte';

  const entries = $derived.by(() =>
    checklists
      .map((checklist) => {
        const game = appStore.state.games[checklist.slug];
        return {
          checklist,
          game,
          progress: computeProgress(checklist, game),
        };
      })
      .sort((a, b) => {
        const opened = (b.game?.lastOpenedAt ?? 0) - (a.game?.lastOpenedAt ?? 0);
        if (opened !== 0) return opened;
        return a.checklist.title.localeCompare(b.checklist.title);
      }),
  );

  function formatLastOpened(timestamp: number | undefined): string {
    if (!timestamp) return 'Not opened yet';
    const date = new Date(timestamp);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.round(
      (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
    );
    if (days === 0) return 'Opened today';
    if (days === 1) return 'Opened yesterday';
    if (days > 1 && days < 7) return `Opened ${days} days ago`;
    return `Opened ${date.toLocaleDateString()}`;
  }
</script>

<svelte:head>
  <title>RA Planner</title>
</svelte:head>

<div class="page library-page">
  <PageHeader title="RA Planner" subtitle="Order-dependent checklists">
    {#snippet children()}
      <a class="icon-button" href="#/settings" aria-label="Settings">
        <span aria-hidden="true">⚙</span>
      </a>
    {/snippet}
  </PageHeader>

  <p class="library-intro">
    Work through each chapter in order. The app always points you at the next step, and warns
    if you jump ahead.
  </p>

  {#if entries.length === 0}
    <div class="empty-state">
      <h2>No checklists yet</h2>
      <p>
        Add a YAML file to <code>checklists/</code> and rebuild the app. See
        <code>docs/CHECKLIST_AUTHORING.md</code> for the format.
      </p>
    </div>
  {:else}
    <ul class="game-list">
      {#each entries as entry (entry.checklist.slug)}
        <li>
          <a class="game-card" href="#/game/{entry.checklist.slug}">
            <div class="game-card-top">
              <div class="game-card-title">
                <h2>{entry.checklist.title}</h2>
                <p class="game-meta">
                  {entry.checklist.console ?? 'Console not set'}
                  <span aria-hidden="true">·</span>
                  {entry.checklist.chapters.length}
                  {entry.checklist.chapters.length === 1 ? 'chapter' : 'chapters'}
                </p>
              </div>
              <span class="game-count">
                {entry.progress.overall.done}/{entry.progress.overall.total}
              </span>
            </div>

            <ProgressBar
              done={entry.progress.overall.done}
              total={entry.progress.overall.total}
              label="Progress: {entry.checklist.title}"
            />

            <div class="game-card-bottom">
              <span>{formatLastOpened(entry.game?.lastOpenedAt)}</span>
              {#if entry.progress.complete}
                <span class="complete-label">Complete</span>
              {:else if entry.progress.currentChapter}
                <span class="next-label">
                  Next: {entry.progress.currentChapter.title}
                </span>
              {/if}
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>
