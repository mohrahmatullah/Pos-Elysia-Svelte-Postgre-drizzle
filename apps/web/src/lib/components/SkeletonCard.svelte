<script lang="ts">
  import Skeleton from './Skeleton.svelte';

  let {
    lines = 3,
    class: cls = '',
  }: { lines?: number; class?: string } = $props();

  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
</script>

<div class={`rounded-card border border-edge bg-surface-2 p-4 ${cls}`} aria-busy="true" aria-label="Memuat">
  <Skeleton height="0.65rem" width="38%" radius="0.35rem" />
  <div class="mt-3 space-y-2.5">
    {#each range(lines) as i (i)}
      <Skeleton
        height={i === 0 ? '1.4rem' : '0.8rem'}
        width={i === 0 ? '55%' : `${88 - i * 18}%`}
        radius="0.35rem"
      />
    {/each}
  </div>
</div>
