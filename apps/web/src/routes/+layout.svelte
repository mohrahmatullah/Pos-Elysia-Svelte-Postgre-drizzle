<script lang="ts">
import '../app.css';
import InstallPrompt from '$lib/components/InstallPrompt.svelte';
  import { initInstallPrompt } from '$lib/pwa/install';
  import { registerServiceWorker } from '$lib/pwa/register';

  let { children } = $props();

  // PWA: register SW + install prompt (client only).
  $effect(() => {
    void registerServiceWorker();
    initInstallPrompt();
  });
</script>

{@render children?.()}
<InstallPrompt />
