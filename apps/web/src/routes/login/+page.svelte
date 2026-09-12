<script lang="ts">
  import { goto } from '$app/navigation';
  import { login } from '$lib/auth';
  import '../../app.css';

  let email = $state('owner@pos.local');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

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

<div class="wrap">
  <form class="card" onsubmit={submit}>
    <h1>🛒 POS Login</h1>
    <p class="muted">Masuk untuk melanjutkan</p>
    <label for="email">Email</label>
    <input id="email" type="email" bind:value={email} required autocomplete="username" />
    <label for="password">Password</label>
    <input id="password" type="password" bind:value={password} required autocomplete="current-password" />
    {#if error}<p class="error-text">{error}</p>{/if}
    <button type="submit" class="primary" disabled={busy} style="margin-top:1rem;width:100%">
      {busy ? 'Memproses…' : 'Masuk'}
    </button>
    <p class="muted hint">Demo: owner@pos.local / Passw0rd!</p>
  </form>
</div>

<style>
  .wrap {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: var(--bg);
  }
  form {
    width: 340px;
    padding: 1.6rem;
  }
  h1 {
    margin: 0 0 0.2rem;
    font-size: 1.3rem;
  }
  .hint {
    font-size: 0.78rem;
    text-align: center;
    margin-top: 1rem;
  }
  button {
    font-size: 1rem;
  }
</style>
