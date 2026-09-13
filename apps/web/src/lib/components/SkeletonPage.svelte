<script lang="ts">
  import Skeleton from './Skeleton.svelte';
  import SkeletonCard from './SkeletonCard.svelte';
  import SkeletonTable from './SkeletonTable.svelte';

  let {
    cards = 0,
    rows = 6,
    cols = 5,
    class: cls = '',
  }: { cards?: number; rows?: number; cols?: number; class?: string } = $props();

  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
</script>

<div class={`page ${cls}`} aria-busy="true" aria-label="Memuat halaman">
  <div class="page-header">
    <div class="flex-1">
      <Skeleton height="1.35rem" width="220px" radius="0.4rem" />
      <div class="mt-2">
        <Skeleton height="0.75rem" width="160px" radius="0.35rem" />
      </div>
    </div>
    <Skeleton height="2.2rem" width="120px" radius="0.6rem" />
  </div>

  {#if cards > 0}
    <div class="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {#each range(cards) as i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {/if}

  <SkeletonTable {rows} {cols} />
</div>
