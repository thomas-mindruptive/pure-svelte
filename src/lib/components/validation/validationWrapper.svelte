<!-- ValidationWrapper.svelte -->
<script>
    import { log } from "$lib/utils/logger";

  let { errors, data, children } = $props();
  log.debug(`(ValidationWrapper) Props:`, { errors, data });
</script>

{#if errors}
  <div class="component-error-boundary">
    <h3>Error</h3>
    {#each errors as error}
      <p>{error.path.join(".")}: {error.message}</p>
    {/each}
  </div>
{:else}
  {@render children()}
{/if}