<script lang="ts">
  import type { RaAchievement } from '$lib/ra/api';

  let {
    achievementId,
    achievement,
    onOpen,
  }: {
    achievementId: number;
    achievement?: RaAchievement;
    onOpen: (id: number) => void;
  } = $props();
</script>

<button
  type="button"
  class="achievement-chip"
  class:earned={achievement?.earned}
  onclick={() => onOpen(achievementId)}
  title={achievement ? `${achievement.title}${achievement.earned ? ' (earned on RA)' : ''}` : `Achievement ${achievementId}`}
>
  {#if achievement?.badgeUrl}
    <img
      class="achievement-badge"
      src={achievement.badgeUrl}
      alt=""
      loading="lazy"
      width="32"
      height="32"
    />
  {:else}
    <span class="achievement-badge placeholder" aria-hidden="true">★</span>
  {/if}
  <span class="achievement-name">
    {achievement?.title ?? `Achievement ${achievementId}`}
  </span>
  {#if achievement?.earned}
    <span class="achievement-earned" aria-label="Earned on RetroAchievements">✓</span>
  {/if}
</button>
