<!-- src/routes/(browser)/suppliers/[supplierId]/categories/[categoryId]/offerings/[offeringId]/links/+page.svelte -->
<script lang="ts">
  import OfferDetailLinksPage from '$lib/components/domain/offerings/OfferDetailLinksPage.svelte';
  let { data } = $props();
</script>
<OfferDetailLinksPage {data} />