<script lang="ts">
  import OfferDetailAttributesPage from '$lib/components/domain/offerings/OfferDetailAttributesPage.svelte';
  let { data } = $props();
</script>
<OfferDetailAttributesPage {data} />