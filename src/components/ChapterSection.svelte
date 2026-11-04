<script lang="ts">
  import type { Chapter, GameState, Step } from '$lib/schema';
  import type { RaGameProgress } from '$lib/ra/api';
  import { isChecked } from '$lib/state';
  import PlainText from './PlainText.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import StepRow from './StepRow.svelte';

  let {
    chapter,
    count,
    expanded,
    current,
    game,
    textToggles,
    raData,
    onToggleExpanded,
    onToggleStep,
    onOpenAchievement,
  }: {
    chapter: Chapter;
    count: { done: number; total: number };
    expanded: boolean;
    current: boolean;
    game: GameState | undefined;
    textToggles: boolean;
    raData?: RaGameProgress;
    onToggleExpanded: () => void;
    onToggleStep: (step: Step) => void;
    onOpenAchievement: (id: number) => void;
  } = $props();

  const complete = $derived(count.done >= count.total);
</script>

<section class="chapter" class:current class:complete>
  <button
    type="button"
    class="chapter-header"
    aria-expanded={expanded}
    onclick={onToggleExpanded}
  >
    <span class="chapter-chevron" class:open={expanded} aria-hidden="true">▸</span>
    <span class="chapter-heading">
      <span class="chapter-title-row">
        <h2>{chapter.title}</h2>
        {#if current}<span class="current-pill">Current</span>{/if}
        {#if complete}<span class="complete-pill">Done</span>{/if}
      </span>
      {#if chapter.summary}
        <span class="chapter-summary"><PlainText text={chapter.summary} /></span>
      {/if}
    </span>
    <span class="chapter-count">{count.done}/{count.total}</span>
  </button>

  <div class="chapter-progress">
    <ProgressBar
      done={count.done}
      total={count.total}
      label="Chapter progress: {chapter.title}"
    />
  </div>

  {#if expanded}
    <div class="step-list" role="list">
      {#each chapter.steps as step (step.id)}
        <div class="step-list-item" role="listitem">
          <StepRow
            {step}
            checked={isChecked(game, step.id)}
            {textToggles}
            {raData}
            onToggle={() => onToggleStep(step)}
            {onOpenAchievement}
          />
        </div>
      {/each}
    </div>
  {/if}
</section>
