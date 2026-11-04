<script lang="ts">
  import { onMount } from 'svelte';
  import type { RaAchievement } from '$lib/ra/api';
  import PlainText from './PlainText.svelte';

  let {
    achievementId,
    achievement,
    onClose,
  }: {
    achievementId: number;
    achievement?: RaAchievement;
    onClose: () => void;
  } = $props();

  let closeButton = $state<HTMLButtonElement | null>(null);

  onMount(() => {
    closeButton?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  const link = $derived(`https://retroachievements.org/achievement/${achievementId}`);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="sheet-backdrop" role="presentation" onclick={onClose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
  <div class="sheet-handle" aria-hidden="true"></div>
  <div class="sheet-header">
    {#if achievement?.badgeUrl}
      <img
        class="sheet-badge"
        src={achievement.badgeUrl}
        alt=""
        width="64"
        height="64"
      />
    {:else}
      <span class="sheet-badge placeholder" aria-hidden="true">★</span>
    {/if}
    <div class="sheet-heading">
      <h2 id="sheet-title">{achievement?.title ?? `Achievement ${achievementId}`}</h2>
      <div class="sheet-facts">
        {#if achievement}
          <span>{achievement.points} points</span>
          {#if achievement.earned}
            <span class="earned-text">
              Earned
              {achievement.earnedMode === 'hardcore' ? '(hardcore)' : '(softcore)'}
              {#if achievement.dateEarnedHardcore || achievement.dateEarned}
                on {achievement.dateEarnedHardcore ?? achievement.dateEarned}
              {/if}
            </span>
          {:else}
            <span>Not earned yet</span>
          {/if}
        {:else}
          <span>No cached achievement data</span>
        {/if}
      </div>
    </div>
    <button
      type="button"
      class="icon-button sheet-close"
      aria-label="Close achievement details"
      bind:this={closeButton}
      onclick={onClose}
    >
      <span aria-hidden="true">×</span>
    </button>
  </div>

  {#if achievement?.description}
    <p class="sheet-description"><PlainText text={achievement.description} /></p>
  {:else if !achievement}
    <p class="sheet-description">
      Open this achievement on RetroAchievements for its description and current status.
    </p>
  {/if}

  <a class="secondary-button sheet-link" href={link} target="_blank" rel="noopener noreferrer">
    Open on RetroAchievements ↗
  </a>
</div>
