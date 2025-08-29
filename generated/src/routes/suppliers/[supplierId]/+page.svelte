<script lang="ts">------------------------------------------------------
    import SupplierDetailPage from "../../../lib/pages/suppliers/SupplierDetailPage.svelte";

    let { data } = $props();
</script>

<SupplierDetailPage {data} />