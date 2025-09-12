<script lang="ts">
    import CategoryDetailPage from "$lib/components/domain/suppliers/categories/SupplierCategoryDetailPage.svelte";

    let { data } = $props();
</script>

<CategoryDetailPage {data} />