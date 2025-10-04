<!-- src/routes/(browser)/categories/[categoryId]/productdefinitions/+page.svelte -->
<script lang="ts">
  /**
   * Route Delegator (UI)
   */
  import CategoryDetailPage from '$lib/components/domain/categories/CategoryDetailPage.svelte';
  let { data } = $props();
</script>

<CategoryDetailPage {data} />
