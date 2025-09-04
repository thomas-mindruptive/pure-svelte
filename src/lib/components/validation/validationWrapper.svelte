<!-- ValidationWrapper.svelte -->
<script>
  let { errors, data, children } = $props();
</script>

{#if errors}
  <div class="component-error-boundary">
    <h3>Error</h3>
    {#each errors as error}
      <p>{error.path.join(".")}: {error.message}</p>
    {/each}
  </div>
{:else if data}
  {@render children()}
{/if}