<script lang="ts">
  import type { Snippet } from 'svelte';
  import { router } from '$lib/router.svelte';

  let {
    title,
    subtitle = '',
    back = false,
    children,
  }: {
    title: string;
    subtitle?: string;
    back?: boolean;
    children?: Snippet;
  } = $props();

  function goBack(): void {
    router.navigate('/');
  }
</script>

<header class="page-header">
  <div class="page-header-main">
    {#if back}
      <button class="icon-button" type="button" aria-label="Back to library" onclick={goBack}>
        <span aria-hidden="true">←</span>
      </button>
    {/if}
    <div class="page-header-title">
      <h1>{title}</h1>
      {#if subtitle}<p>{subtitle}</p>{/if}
    </div>
  </div>
  {#if children}
    <div class="page-header-actions">{@render children()}</div>
  {/if}
</header>
