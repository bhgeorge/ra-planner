<script lang="ts">
  import { onMount } from 'svelte';
  import ToastHost from '$components/ToastHost.svelte';
  import { router } from '$lib/router.svelte';
  import { wakeLock } from '$lib/wakeLock.svelte';
  import Game from '$routes/Game.svelte';
  import Library from '$routes/Library.svelte';
  import Settings from '$routes/Settings.svelte';

  onMount(() => {
    wakeLock.init();
  });

  $effect(() => {
    // Read the route so this effect re-runs on every navigation.
    const route = router.route;
    void route;
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0 });
    }
  });
</script>

{#if router.route.name === 'library'}
  <Library />
{:else if router.route.name === 'game'}
  {#key router.route.slug}
    <Game slug={router.route.slug} />
  {/key}
{:else if router.route.name === 'settings'}
  <Settings />
{:else}
  <div class="page">
    <div class="empty-state">
      <h1>Page not found</h1>
      <p>The address <code>#{router.route.path}</code> does not exist.</p>
      <a class="primary-button" href="#/">Back to library</a>
    </div>
  </div>
{/if}

<ToastHost />
