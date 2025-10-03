<!-- src/routes/suppliers/[supplierId]/+page.svelte -->
<script lang="ts">
  /**
   * Route Delegator (UI)
   */
  // SupplierDetailPage handles children: categories, orders.
  import SupplierDetailPage from '$lib/components/domain/suppliers/SupplierDetailPage.svelte';
  let { data } = $props();
</script>

<SupplierDetailPage {data} />