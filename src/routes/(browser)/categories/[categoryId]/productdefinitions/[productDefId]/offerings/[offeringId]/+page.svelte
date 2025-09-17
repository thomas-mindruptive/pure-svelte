<script lang="ts">
    import ProductDefinitionDetailPage from '$lib/components/domain/offerings/OfferDetailLinksPage.svelte';

    let { data } = $props();
</script>

<ProductDefinitionDetailPage {data} />