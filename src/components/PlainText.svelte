<script lang="ts">
  type Part =
    | { type: 'text'; text: string }
    | { type: 'link'; text: string; href: string };

  let { text, className = '' }: { text: string; className?: string } = $props();

  function tokenize(value: string): Part[] {
    const parts: Part[] = [];
    const pattern = /https?:\/\/[^\s<>"']+/g;
    let lastIndex = 0;

    for (const match of value.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (index > lastIndex) {
        parts.push({ type: 'text', text: value.slice(lastIndex, index) });
      }

      let href = match[0];
      let trailing = '';
      while (/[.,;:!?)\]]$/.test(href)) {
        trailing = href.slice(-1) + trailing;
        href = href.slice(0, -1);
      }

      if (/^https?:\/\/.+/.test(href)) {
        parts.push({ type: 'link', text: href, href });
      } else {
        parts.push({ type: 'text', text: href });
      }
      if (trailing) parts.push({ type: 'text', text: trailing });
      lastIndex = index + match[0].length;
    }

    if (lastIndex < value.length) {
      parts.push({ type: 'text', text: value.slice(lastIndex) });
    }
    return parts;
  }

  const parts = $derived(tokenize(text));
</script>

<span class="plain-text {className}"
  >{#each parts as part}{#if part.type === 'link'}<a
        href={part.href}
        target="_blank"
        rel="noopener noreferrer">{part.text}</a
      >{:else}{part.text}{/if}{/each}</span
>
