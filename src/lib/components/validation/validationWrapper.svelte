<!-- ValidationWrapper.svelte -->
<script lang="ts">
  import { log } from "$lib/utils/logger";
  import type { Snippet } from "svelte";
  import type { ZodLikeValidationError, ValidationErrorTree } from "./validation.types";
  import { stringifyForHtml } from "$lib/utils/formatUtils";

  interface Props {
    renderChildrenInCaseOfErrors?: Boolean | undefined;
    errors: ZodLikeValidationError[] | ValidationErrorTree | null | undefined;
    children: Snippet;
  }
  let { renderChildrenInCaseOfErrors = true, errors, children }: Props = $props();
  log.debug(`(ValidationWrapper) Props:`, { errors, renderChildrenInCaseOfErrors });
</script>

{#if errors && (Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0)}
  <div class="component-error-boundary">
    <h3>Error</h3>
    {@html stringifyForHtml(errors)}
  </div>
{/if}
{#if !errors || renderChildrenInCaseOfErrors}
  {@render children()}
{/if}
