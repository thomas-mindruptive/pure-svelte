<script lang="ts">
    import CategoryDetailPage from "$lib/pages/categories/CategoryDetailPage.svelte";

    let { data } = $props();
</script>

<CategoryDetailPage {data} />