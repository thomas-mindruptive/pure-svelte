<script lang="ts">
    import CategoryDetailPage from "$lib/components/domain/categories/CategoryDetailPage.svelte";

    let { data } = $props();
</script>

<CategoryDetailPage {data} />