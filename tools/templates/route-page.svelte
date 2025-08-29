<script lang="ts">
    // SCAFFOLD-REMOVE-BEGIN ...
    // @ts-expect-error ...
    // SCAFFOLD-REMOVE-END ...
    import PageName$PlaceHolder from "aliasPath$PlaceHolder/PageName$PlaceHolder.svelte";

    let { data } = $props();
</script>

<PageName$PlaceHolder {data} />