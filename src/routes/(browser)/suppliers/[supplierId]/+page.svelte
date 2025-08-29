<!-- src/routes/suppliers/[supplierId]/+page.svelte -->
<script lang="ts">
  /**
   * Route Delegator (UI)
   */
  import SupplierDetailPage from '$lib/pages/suppliers/SupplierDetailPage.svelte';

  let { data } = $props();
</script>

<SupplierDetailPage {data} />