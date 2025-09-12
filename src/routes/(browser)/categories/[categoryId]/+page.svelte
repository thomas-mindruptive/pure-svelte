<script lang="ts">
    import CategoryDetailPage from "$lib/components/domain/categories/SupplierCategoryDetailPage.svelte";

    let { data } = $props();
</script>

<CategoryDetailPage {data} />