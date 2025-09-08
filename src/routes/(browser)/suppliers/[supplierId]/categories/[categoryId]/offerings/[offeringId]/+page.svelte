<script lang="ts">
    import OfferDetailLinksPage from "$lib/components/domain/offerings/OfferDetailLinksPage.svelte";

    let { data } = $props();
</script>

<OfferDetailLinksPage {data} />