<!-- src/routes/suppliers/+page.svelte -->
<script lang="ts">
  /**
   * Route Delegator (UI)
   *
   * This file adheres to the Page Delegation Pattern.
   * Its only purpose is to import and render the actual page component,
   * passing down the data loaded by its sibling `+page.ts`.
   */
  import SupplierListPage from '$lib/components/domain/categories/CategoryListPage.svelte';

  let { data } = $props();
</script>

<SupplierListPage {data} />