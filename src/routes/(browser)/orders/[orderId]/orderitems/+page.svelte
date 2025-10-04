<script lang="ts">
  // Route Delegator (UI)
  import OrderDetailPage from "$lib/components/domain/orders/OrderDetailPage.svelte";
  const { data } = $props();
</script>

<OrderDetailPage {data} />
