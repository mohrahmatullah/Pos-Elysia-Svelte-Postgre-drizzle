<script lang="ts">
  /** Base skeleton block — Tailwind animate-pulse shimmer. */
  let {
    width = '100%',
    height = '1rem',
    radius = '0.5rem',
    class: cls = '',
  }: { width?: string; height?: string; radius?: string; class?: string } = $props();
</script>

<div
  class={`animate-pulse rounded-lg bg-white/10 ${cls}`}
  style={`width:${width};height:${height};border-radius:${radius};`}
  aria-hidden="true"
></div>
