<script lang="ts">
  import type { Step } from '$lib/schema';
  import type { RaGameProgress } from '$lib/ra/api';
  import AchievementChip from './AchievementChip.svelte';
  import PlainText from './PlainText.svelte';

  let {
    step,
    checked,
    textToggles,
    raData,
    onToggle,
    onOpenAchievement,
  }: {
    step: Step;
    checked: boolean;
    textToggles: boolean;
    raData?: RaGameProgress;
    onToggle: () => void;
    onOpenAchievement: (id: number) => void;
  } = $props();

  const achievementIds = $derived(step.achievementIds ?? []);
  const achievements = $derived(
    achievementIds.map((id) => raData?.achievements[String(id)]),
  );
  const earnedOnRa = $derived(
    !checked && achievements.some((achievement) => achievement?.earned),
  );
  const noteId = $derived(`note-${step.id}`);
</script>

<div class="step-row" class:checked id="step-{step.id}">
  <button
    type="button"
    class="step-checkbox"
    role="checkbox"
    aria-checked={checked}
    aria-label={checked ? `Uncheck: ${step.text}` : `Check: ${step.text}`}
    onclick={onToggle}
  >
    <span class="checkbox-box" aria-hidden="true">{checked ? '✓' : ''}</span>
  </button>

  <div class="step-content">
    {#if textToggles}
      <button
        type="button"
        class="step-text step-text-button"
        class:done={checked}
        onclick={onToggle}
      >
        <PlainText text={step.text} />
      </button>
    {:else}
      <p class="step-text" class:done={checked}>
        <PlainText text={step.text} />
      </p>
    {/if}

    {#if achievementIds.length > 0 || earnedOnRa}
      <div class="step-meta">
        {#if earnedOnRa}
          <span class="ra-earned-marker">earned</span>
        {/if}

        {#each achievementIds as id (id)}
          <AchievementChip
            achievementId={id}
            achievement={raData?.achievements[String(id)]}
            onOpen={onOpenAchievement}
          />
        {/each}
      </div>
    {/if}

    {#if step.location}
        <div class="step-location">{step.location}</div>
        {/if}

    {#if step.note}
      <div class="step-note" id={noteId}>
        <PlainText text={step.note} />
      </div>
    {/if}
  </div>
</div>
