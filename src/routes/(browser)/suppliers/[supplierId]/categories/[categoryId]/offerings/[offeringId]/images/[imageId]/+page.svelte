<!-- Suppliers Route: Edit Offering Image -->
<script lang="ts">
  import ImageDetailPage from '$lib/components/domain/offeringImages/ImageDetailPage.svelte';

  const { data } = $props();
</script>

<ImageDetailPage {...data} />
