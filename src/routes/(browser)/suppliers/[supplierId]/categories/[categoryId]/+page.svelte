<!-- src/routes/(browser)/suppliers/[supplierId]/categories/[categoryId]/+page.svelte -->
<script lang="ts">
  /**
   * Route Delegator (UI)
   */
  import CategoryDetailPage from '$lib/pages/categories/CategoryDetailPage.svelte';

  let { data } = $props();
</script>

<CategoryDetailPage {data} />