<!-- src/routes/suppliers/+page.svelte -->
<script lang="ts">
  /**
   * Route Delegator (UI)
   *
   * ⚠️ NOTE: with this list page, we change the +page.ts -> load -> page.svelte pattern!
   * Reason: We use the "streaming API" approach anyway,
   * i.e. the "load" function only returns promises, not the data itself.
   * => There is no advantage, quite the oopisite:
   * We would have to maintain an indirection (= +page.ts).
   */
  import SupplierListPage from "$lib/components/domain/orders/OrderListPage.svelte";
</script>

<SupplierListPage />
