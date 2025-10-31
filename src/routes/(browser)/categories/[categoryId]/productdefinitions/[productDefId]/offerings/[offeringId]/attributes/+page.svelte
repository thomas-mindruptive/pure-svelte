<script lang="ts">
    import OfferingDetailPage from '$lib/components/domain/offerings/OfferingDetailPage.svelte';

    let { data } = $props();
</script>

<OfferingDetailPage {data} />