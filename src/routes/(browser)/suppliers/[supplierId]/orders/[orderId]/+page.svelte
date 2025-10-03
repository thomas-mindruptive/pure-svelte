<script lang="ts">
  /**
   * Route Delegator (UI)
   */
  import OrderDetailPage from '$lib/components/domain/orders/OrderDetailPage.svelte';
  let { data } = $props();
</script>

<OrderDetailPage {data} />