<script lang="ts">
  import Skeleton from './Skeleton.svelte';

  let {
    rows = 6,
    cols = 5,
    class: cls = '',
  }: { rows?: number; cols?: number; class?: string } = $props();

  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
</script>

<div class={`overflow-hidden rounded-card border border-edge ${cls}`} aria-busy="true" aria-label="Memuat data">
  <div class="flex items-center gap-3 border-b border-edge bg-surface-1/60 px-4 py-3">
    {#each range(cols) as c (c)}
      <Skeleton height="0.7rem" width={c === 0 ? '22%' : '16%'} radius="0.35rem" class="flex-1" />
    {/each}
  </div>
  {#each range(rows) as r (r)}
    <div class="flex items-center gap-3 border-b border-edge/60 px-4 py-3.5 last:border-b-0">
      {#each range(cols) as c (c)}
        <Skeleton
          height="0.8rem"
          width={c === 0 ? '22%' : `${12 + ((r + c) % 3) * 4}%`}
          radius="0.35rem"
          class="flex-1"
        />
      {/each}
    </div>
  {/each}
</div>
