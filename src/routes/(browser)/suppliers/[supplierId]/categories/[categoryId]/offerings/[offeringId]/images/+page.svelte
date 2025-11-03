<!-- src/routes/(browser)/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/images/+page.svelte -->
<script lang="ts">
  import OfferingDetailPage from '$lib/components/domain/offerings/OfferingDetailPage.svelte';
  let { data } = $props();
</script>
<OfferingDetailPage {data} />
