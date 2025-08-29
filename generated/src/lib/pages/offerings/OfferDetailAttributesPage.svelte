<script lang="ts">
  // Svelte 5: Using $props()
  let { data } = $props();
</script>

<h1>OfferDetailAttributesPage</h1>
<p>This is the main UI component for this page.</p>

<pre>Loaded Data: {JSON.stringify(data, null, 2)}</pre>