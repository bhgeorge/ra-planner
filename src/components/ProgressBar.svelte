<script lang="ts">
  let {
    done,
    total,
    showLabel = false,
    label = 'Progress',
  }: {
    done: number;
    total: number;
    showLabel?: boolean;
    label?: string;
  } = $props();

  const percent = $derived(total > 0 ? Math.round((done / total) * 100) : 0);
  const complete = $derived(total > 0 && done >= total);
</script>

<div class="progress-wrap">
  {#if showLabel}
    <div class="progress-label">
      <span>{label}</span>
      <span>{done}/{total}</span>
    </div>
  {/if}
  <div
    class="progress-track"
    class:complete
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={total}
    aria-valuenow={done}
  >
    <div class="progress-fill" style:width="{percent}%"></div>
  </div>
</div>
