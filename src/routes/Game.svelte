<script lang="ts">
  import { onMount, tick } from 'svelte';
  import AchievementSheet from '$components/AchievementSheet.svelte';
  import ChapterSection from '$components/ChapterSection.svelte';
  import ConfirmDialog from '$components/ConfirmDialog.svelte';
  import PageHeader from '$components/PageHeader.svelte';
  import PlainText from '$components/PlainText.svelte';
  import ProgressBar from '$components/ProgressBar.svelte';
  import SyncChip from '$components/SyncChip.svelte';
  import { getChecklist } from '$lib/checklists';
  import {
    loadExpandedChapters,
    loadTextToggles,
    saveExpandedChapters,
  } from '$lib/prefs';
  import { computeProgress, isOutOfOrder } from '$lib/progress';
  import { raStore } from '$lib/ra/store.svelte';
  import { router } from '$lib/router.svelte';
  import type { Step } from '$lib/schema';
  import { isChecked } from '$lib/state';
  import { appStore } from '$lib/store.svelte';
  import { toasts } from '$lib/toast.svelte';
  import { wakeLock } from '$lib/wakeLock.svelte';

  let { slug }: { slug: string } = $props();

  const checklist = $derived(getChecklist(slug));
  const game = $derived(appStore.state.games[slug]);
  const progress = $derived(checklist ? computeProgress(checklist, game) : null);

  const raGameId = $derived(checklist?.raGameId ?? null);
  const raData = $derived(raGameId !== null ? raStore.dataFor(raGameId) : undefined);
  const raLoading = $derived(
    raGameId !== null ? raStore.isLoading(raGameId) : false,
  );
  const raError = $derived(raGameId !== null ? raStore.errorFor(raGameId) : null);
  const raStale = $derived(raGameId !== null ? raStore.isStale(raGameId) : false);

  let expanded = $state(new Set<string>());
  let textToggles = $state(true);
  let showReset = $state(false);
  let activeAchievementId = $state<number | null>(null);
  let nextVisible = $state(true);
  let observer: IntersectionObserver | null = null;
  let menuEl = $state<HTMLDetailsElement | null>(null);

  onMount(() => {
    textToggles = loadTextToggles();
    if (!checklist) return;

    const current = computeProgress(checklist, appStore.getGame(slug));
    const saved = loadExpandedChapters(slug);
    const validChapterIds = new Set(checklist.chapters.map((chapter) => chapter.id));
    expanded = new Set(
      saved
        ? saved.filter((id) => validChapterIds.has(id))
        : current.currentChapterId
          ? [current.currentChapterId]
          : [],
    );

    appStore.touch(slug);
    if (checklist.raGameId) void raStore.load(checklist.raGameId);
  });

  $effect(() => {
    const stepId = progress?.nextStep?.id;
    const chapterId = progress?.nextStepChapterId;
    const chapterExpanded = chapterId ? expanded.has(chapterId) : false;

    observer?.disconnect();
    observer = null;

    if (!stepId) {
      nextVisible = true;
      return;
    }

    if (!chapterExpanded) {
      nextVisible = false;
      return;
    }

    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`step-${stepId}`);
      if (!element) {
        nextVisible = false;
        return;
      }
      const rect = element.getBoundingClientRect();
      nextVisible = rect.bottom > 0 && rect.top < window.innerHeight;
      observer = new IntersectionObserver(
        (entries) => {
          nextVisible = entries.some((entry) => entry.isIntersecting);
        },
        { threshold: 0.3 },
      );
      observer.observe(element);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  });

  function setChapterExpanded(chapterId: string, value: boolean): void {
    const next = new Set(expanded);
    if (value) next.add(chapterId);
    else next.delete(chapterId);
    expanded = next;
    saveExpandedChapters(slug, next);
  }

  function shorten(text: string, max = 64): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function toggleStep(step: Step): void {
    if (!checklist) return;
    const gameState = appStore.getGame(slug);
    const wasChecked = isChecked(gameState, step.id);
    const outOfOrder = !wasChecked && isOutOfOrder(checklist, gameState, step.id);

    appStore.toggle(slug, step.id);

    if (wasChecked) return;

    toasts.show({
      message: `Checked “${shorten(step.text)}”`,
      kind: 'success',
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          appStore.toggle(slug, step.id);
        },
      },
    });

    if (outOfOrder) {
      toasts.show({
        message:
          'This is in a later chapter than your current one. Finish earlier chapters first to avoid missing something.',
        kind: 'warning',
        duration: 8000,
      });
    }

    const after = computeProgress(checklist, appStore.getGame(slug));
    if (after.currentChapterId && !expanded.has(after.currentChapterId)) {
      setChapterExpanded(after.currentChapterId, true);
    }
  }

  function checkNext(): void {
    const step = progress?.nextStep;
    if (step) toggleStep(step);
  }

  async function jumpToNext(): Promise<void> {
    if (!progress?.nextStep) return;
    const stepId = progress.nextStep.id;
    const chapterId = progress.nextStepChapterId;
    if (chapterId && !expanded.has(chapterId)) {
      setChapterExpanded(chapterId, true);
    }
    await tick();
    document.getElementById(`step-${stepId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  async function refreshRa(): Promise<void> {
    if (raGameId === null) return;
    await raStore.load(raGameId, { force: true });
    const error = raStore.errorFor(raGameId);
    if (error) {
      toasts.show({ message: error, kind: 'error', duration: 7000 });
    } else {
      toasts.show({
        message: 'RetroAchievements data refreshed.',
        kind: 'success',
        duration: 3000,
      });
    }
  }

  function closeMenu(): void {
    if (menuEl) menuEl.open = false;
  }

  async function toggleKeepAwake(): Promise<void> {
    closeMenu();
    const next = !wakeLock.enabled;
    await wakeLock.setEnabled(next);
    if (next && wakeLock.error) {
      toasts.show({ message: wakeLock.error, kind: 'warning' });
    } else {
      toasts.show({
        message: next ? 'Screen will stay awake.' : 'Screen wake lock disabled.',
        kind: 'info',
        duration: 3000,
      });
    }
  }

  function confirmReset(): void {
    showReset = false;
    appStore.reset(slug);
    toasts.show({
      message:
        'Checklist reset. Syncing will uncheck these steps on your other devices too.',
      kind: 'success',
      duration: 7000,
    });
  }

  function handleWindowClick(event: MouseEvent): void {
    if (!menuEl?.open) return;
    if (event.target instanceof Node && !menuEl.contains(event.target)) {
      menuEl.open = false;
    }
  }
</script>

<svelte:head>
  <title>{checklist ? `${checklist.title} · RA Planner` : 'RA Planner'}</title>
</svelte:head>

<svelte:window onclick={handleWindowClick} />

{#if !checklist}
  <div class="page">
    <PageHeader title="Checklist not found" back />
    <div class="empty-state">
      <h2>No checklist named “{slug}”</h2>
      <p>It may have been renamed or removed. Return to the library to pick another game.</p>
      <a class="primary-button" href="#/">Back to library</a>
    </div>
  </div>
{:else if progress}
  <div class="page game-page">
    <header class="game-header">
      <div class="game-top">
        <button
          type="button"
          class="icon-button"
          aria-label="Back to library"
          onclick={() => router.navigate('/')}
        >
          <span aria-hidden="true">←</span>
        </button>

        <div class="game-title-block">
          <h1>{checklist.title}</h1>
          <p class="game-meta">
            {checklist.console ?? 'Console not set'}
            <span aria-hidden="true">·</span>
            {progress.overall.done}/{progress.overall.total} steps
          </p>
        </div>

        <SyncChip />

        <details class="game-menu" bind:this={menuEl}>
          <summary class="icon-button" aria-label="Game menu">
            <span aria-hidden="true">⋮</span>
          </summary>
          <div class="game-menu-panel">
            <button type="button" onclick={toggleKeepAwake}>
              Keep screen awake
              <span class="menu-value">{wakeLock.enabled ? 'On' : 'Off'}</span>
            </button>
            <button
              type="button"
              class="menu-danger"
              onclick={() => {
                closeMenu();
                showReset = true;
              }}
            >
              Reset checklist…
            </button>
          </div>
        </details>
      </div>

      <ProgressBar
        done={progress.overall.done}
        total={progress.overall.total}
        label="Overall progress"
      />

      {#if raGameId !== null}
        <div class="game-ra-row">
          {#if raStore.hasCredentials}
            {#if raData}
              <button
                type="button"
                class="ra-summary"
                onclick={refreshRa}
                title="Tap to refresh RetroAchievements data"
              >
                <span>RA {raData.numAwarded}/{raData.numAchievements} achievements</span>
                {#if raLoading}<span class="spinner" aria-label="Loading"></span>{/if}
                {#if raStale}<span class="stale-pill">stale</span>{/if}
              </button>
              <button
                type="button"
                class="icon-button small"
                aria-label="Refresh RetroAchievements data"
                disabled={raLoading}
                onclick={refreshRa}
              >
                <span aria-hidden="true">↻</span>
              </button>
            {:else}
              <button
                type="button"
                class="ra-summary"
                disabled={raLoading}
                onclick={refreshRa}
              >
                {#if raLoading}Loading RetroAchievements…{:else}Load RetroAchievements data{/if}
              </button>
            {/if}
          {:else}
            <a class="ra-hint" href="#/settings">
              Add RetroAchievements credentials to see achievement status
            </a>
          {/if}
        </div>
        {#if raError}
          <p class="ra-error">{raError}</p>
        {/if}
      {/if}
    </header>

    {#if progress.complete}
      <section class="next-up next-up-complete">
        <p class="next-kicker">All done</p>
        <h2>Checklist complete</h2>
        <p class="next-note">Every step is checked. Nice work.</p>
      </section>
    {:else if progress.nextStep}
      <section class="next-up">
        <div class="next-kicker">
          <span>Next up</span>
          {#if progress.currentChapter}
            <span class="next-chapter">{progress.currentChapter.title}</span>
          {/if}
        </div>
        <p class="next-text"><PlainText text={progress.nextStep.text} /></p>
        {#if progress.nextStep.note}
          <p class="next-note"><PlainText text={progress.nextStep.note} /></p>
        {/if}
        <button type="button" class="primary-button next-check" onclick={checkNext}>
          Mark done
        </button>
      </section>
    {/if}

    <p class="order-hint">Complete chapters in order — later chapters assume earlier ones are done.</p>

    <div class="chapter-list">
      {#each checklist.chapters as chapter (chapter.id)}
        <ChapterSection
          {chapter}
          count={progress.chapterProgress[chapter.id]}
          expanded={expanded.has(chapter.id)}
          current={progress.currentChapterId === chapter.id}
          {game}
          {textToggles}
          {raData}
          onToggleExpanded={() =>
            setChapterExpanded(chapter.id, !expanded.has(chapter.id))}
          onToggleStep={toggleStep}
          onOpenAchievement={(id) => (activeAchievementId = id)}
        />
      {/each}
    </div>

    {#if progress.nextStep && !nextVisible}
      <button type="button" class="jump-button" onclick={jumpToNext}>
        <span>Jump to next step</span>
        <span aria-hidden="true">↓</span>
      </button>
    {/if}
  </div>

  {#if activeAchievementId !== null}
    <AchievementSheet
      achievementId={activeAchievementId}
      achievement={raData?.achievements[String(activeAchievementId)]}
      onClose={() => (activeAchievementId = null)}
    />
  {/if}

  {#if showReset}
    <ConfirmDialog
      title="Reset checklist?"
      message="This unchecks every step in this game. After syncing, the reset applies to all of your devices. Steps you check again afterwards will stay checked."
      confirmLabel="Reset checklist"
      danger
      onConfirm={confirmReset}
      onCancel={() => (showReset = false)}
    />
  {/if}
{/if}
