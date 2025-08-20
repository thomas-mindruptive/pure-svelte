<script lang="ts">
	import favicon from "$lib/assets/favicon.svg";
	import Snackbar from "$lib/components/Snackbar.svelte";
	import "../styles/app.css";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Snackbar />
{@render children?.()}
