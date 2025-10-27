<script lang="ts">
    import ProductDefinitionDetailPage from '$lib/components/domain/productDefinitions/ProductDefinitionDetailPage.svelte';
    import type { ProductDefPageProps } from '$lib/components/domain/productDefinitions/ProductDefinitionDetailPage.svelte';
    let { data }: { data: ProductDefPageProps } = $props();
</script>

<ProductDefinitionDetailPage {...data} />
