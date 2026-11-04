<script lang="ts">
  import { onMount } from 'svelte';

  let {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
  }: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  let dialog = $state<HTMLDivElement | null>(null);

  onMount(() => {
    dialog?.focus();
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="dialog-backdrop" role="presentation" onclick={onCancel}></div>
<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  tabindex="-1"
  bind:this={dialog}
>
  <h2 id="dialog-title">{title}</h2>
  <p>{message}</p>
  <div class="dialog-actions">
    <button type="button" class="secondary-button" onclick={onCancel}>{cancelLabel}</button>
    <button
      type="button"
      class:danger-button={danger}
      class:primary-button={!danger}
      onclick={onConfirm}
    >
      {confirmLabel}
    </button>
  </div>
</div>
