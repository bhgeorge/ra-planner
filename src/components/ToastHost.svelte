<script lang="ts">
  import { toasts } from '$lib/toast.svelte';
</script>

{#if toasts.items.length > 0}
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    {#each toasts.items as toast (toast.id)}
      <div class="toast toast-{toast.kind}" role="status">
        <span class="toast-message">{toast.message}</span>
        {#if toast.action}
          <button
            type="button"
            class="toast-action"
            onclick={() => toasts.runAction(toast.id)}
          >
            {toast.action.label}
          </button>
        {/if}
        <button
          type="button"
          class="toast-close"
          aria-label="Dismiss notification"
          onclick={() => toasts.dismiss(toast.id)}
        >
          ×
        </button>
      </div>
    {/each}
  </div>
{/if}
