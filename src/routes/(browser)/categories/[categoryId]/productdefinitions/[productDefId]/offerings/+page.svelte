<script lang="ts">
    import ProductDefinitionDetailPage from '$lib/components/domain/productDefinitions/ProductDefinitionDetailPage.svelte';

    let { data } = $props();
</script>

<ProductDefinitionDetailPage {data} />