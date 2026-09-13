<script lang="ts">
  import { goto } from '$app/navigation';
  import { fade, fly } from 'svelte/transition';
  import { login } from '$lib/auth';
  import { Icon } from '$lib/icons';
  import '../../app.css';

  let email = $state('owner@pos.local');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);
  let showPassword = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    busy = true;
    try {
      await login(email, password);
      await goto('/');
    } catch (err) {
      error = (err as Error).message || 'Login gagal';
    } finally {
      busy = false;
    }
  }
</script>

<div
  class="grid min-h-dvh place-items-center bg-base px-4 py-10"
>
  <div class="w-full max-w-sm" in:fly={{ y: 14, duration: 260 }}>
    <!-- Brand -->
    <div class="mb-6 flex flex-col items-center gap-2">
      <span class="grid h-14 w-14 place-items-center rounded-2xl bg-strong text-white shadow-lg shadow-blue-500/20">
        <Icon icon="mdi:cart-outline" width="30" height="30" />
      </span>
      <h1 class="m-0 text-xl font-bold tracking-tight text-ink">POS Toko Maju Jaya</h1>
      <p class="m-0 text-sm text-dim">Masuk untuk melanjutkan</p>
    </div>

    <form
      class="rounded-2xl border border-edge bg-surface-2 p-6 shadow-xl"
      onsubmit={submit}
      in:fade={{ duration: 200 }}
    >
      <label for="email" class="mb-1 block text-xs font-medium uppercase tracking-wider text-dim"
        >Email</label
      >
      <input
        id="email"
        type="email"
        bind:value={email}
        required
        autocomplete="username"
        class="rounded-xl"
        placeholder="nama@toko.com"
      />
      <label
        for="password"
        class="mb-1 mt-4 block text-xs font-medium uppercase tracking-wider text-dim"
        >Password</label
      >
      <div class="relative">
        <input
          id="password"
          type={showPassword ? 'text' : 'password'}
          bind:value={password}
          required
          autocomplete="current-password"
          class="rounded-xl pr-11"
          placeholder="••••••••"
        />
        <button
          type="button"
          class="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg border-0 bg-transparent text-dim hover:text-ink"
          aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
          onclick={() => (showPassword = !showPassword)}
        >
          <Icon icon={showPassword ? 'mdi:eye-off-outline' : 'mdi:eye-outline'} width="18" height="18" />
        </button>
      </div>

      {#if error}
        <p
          class="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-bad"
          transition:fade={{ duration: 150 }}
          role="alert"
        >
          {error}
        </p>
      {/if}

      <button
        type="submit"
        class="primary mt-5 w-full rounded-xl py-2.5 text-base transition-transform active:scale-[0.98]"
        disabled={busy}
      >
        {#if busy}
          <span class="inline-flex items-center gap-2">
            <Icon icon="mdi:loading" width="18" height="18" class="animate-spin" />
            Memproses…
          </span>
        {:else}
          Masuk
        {/if}
      </button>
    </form>

    <p class="mt-4 text-center text-xs text-dim">
      Demo: <span class="mono">owner@pos.local / Passw0rd!</span>
    </p>
  </div>
</div>
