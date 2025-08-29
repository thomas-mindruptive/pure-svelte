// .../attributes/+page.svelte
<script lang="ts">
  import OfferDetailAttributesPage from '$lib/pages/offerings/OfferDetailAttributesPage.svelte';
  let { data } = $props();
</script>
<OfferDetailAttributesPage {data} />