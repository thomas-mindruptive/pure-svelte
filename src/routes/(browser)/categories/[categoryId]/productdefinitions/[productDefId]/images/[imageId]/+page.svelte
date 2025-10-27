<script lang="ts">
  import ImageDetailPage from '$lib/components/domain/productDefinitionImages/ImageDetailPage.svelte';
  import type { ImageDetailPageProps } from '$lib/components/domain/productDefinitionImages/ImageDetailPage.svelte';
  let { data }: { data: ImageDetailPageProps } = $props();
</script>

<ImageDetailPage {...data} />
