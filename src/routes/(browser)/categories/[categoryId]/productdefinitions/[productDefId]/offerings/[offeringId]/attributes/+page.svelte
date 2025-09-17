<script lang="ts">
    import ProductDefinitionDetailPage from '$lib/components/domain/offerings/OfferDetailAttributesPage.svelte';

    let { data } = $props();
</script>

<ProductDefinitionDetailPage {data} />