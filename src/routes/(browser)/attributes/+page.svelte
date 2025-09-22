<!-- src/routes/(browser)/attributes/+page.svelte -->
<script lang="ts">
  /**
   * Route Delegator (UI)
   *
   * This file adheres to the Page Delegation Pattern.
   * Its only purpose is to import and render the actual page component,
   * passing down the data loaded by its sibling `+page.ts`.
   */
  import AttributeListPage from '$lib/components/domain/attributes/AttributesListPage.svelte';

  let { data } = $props();
</script>

<AttributeListPage {data} />