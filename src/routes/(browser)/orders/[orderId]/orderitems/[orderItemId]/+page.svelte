<script lang="ts">
  import OrderItemDetailPage from "$lib/components/domain/orders/OrderItemDetailPage.svelte";

  let { data } = $props();
</script>

<OrderItemDetailPage {data} />
