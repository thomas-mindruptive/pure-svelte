<script lang="ts">------------------------------------------------------
    import SupplierListPage from "../../lib/pages/suppliers/SupplierListPage.svelte";

    let { data } = $props();
</script>

<SupplierListPage {data} />