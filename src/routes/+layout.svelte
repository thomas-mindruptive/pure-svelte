<script lang="ts">
	import favicon from "$lib/assets/favicon.svg";
	import Snackbar from "$lib/components/Snackbar.svelte";
	import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
	import "../styles/app.css";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<Snackbar />
<ConfirmDialog />
{@render children?.()}
