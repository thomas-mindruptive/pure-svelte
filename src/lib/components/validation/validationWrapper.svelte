<!-- ValidationWrapper.svelte -->
<script lang="ts">
  import { log } from "$lib/utils/logger";
  import type { Snippet } from "svelte";
  import type { ValidationError } from "./validation.types";

  interface Props {
    renderChildrenInCaseOfErrors?: Boolean | undefined;
    errors: ValidationError[] | null | undefined;
    children: Snippet;
  }
  let { renderChildrenInCaseOfErrors = true, errors, children }: Props = $props();
  log.debug(`(ValidationWrapper) Props:`, { errors, renderChildrenInCaseOfErrors });
</script>

{#if errors}
  <div class="component-error-boundary">
    <h3>Error</h3>
    {#each errors as error}
      <p>{error.path.join(".")}: {error.message}</p>
    {/each}
  </div>
{/if}
{#if !errors || renderChildrenInCaseOfErrors}
  {@render children()}
{/if}

