<!-- File: src/lib/components/domain/productDefinitionImages/ImageDetailPage.svelte -->

<script lang="ts">
  import { goto } from "$app/navigation";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getProductDefinitionImageApi } from "$lib/api/client/productDefinitionImage";
  import type { ProductDefinitionImage_Image } from "$lib/domain/domainTypes";
  import { addNotification } from "$lib/stores/notifications";
  import { log } from "$lib/utils/logger";
  import { browser } from "$app/environment";

  // === TYPES ====================================================================================

  export type ImageDetailPageProps = {
    imageId: number | "new";
    productDefId: number;
    categoryId: number;
    isCreateMode: boolean;
  };

  const { imageId, productDefId, categoryId, isCreateMode }: ImageDetailPageProps = $props();

  // === STATE ====================================================================================

  let isLoading = $state(true);
  let image: ProductDefinitionImage_Image | null = $state(null);

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const imageApi = getProductDefinitionImageApi(client);

  // === LOAD DATA ================================================================================

  $effect(() => {
    log.debug(`ImageDetailPage $effect`, { imageId, productDefId, categoryId, isCreateMode });

    if (!browser) return;

    let aborted = false;

    const loadData = async () => {
      isLoading = true;

      try {
        if (!isCreateMode && typeof imageId === "number") {
          image = await imageApi.loadProductDefinitionImage(imageId);
          if (aborted) return;
          log.debug(`Loaded image`, { image });
        } else {
          // Create mode - initialize empty
          image = null;
        }
      } catch (err: any) {
        if (aborted) return;
        const message = err.message || "Failed to load image.";
        addNotification(`Error: ${message}`, "error");
        log.error("Failed to load image", { err });
      } finally {
        if (!aborted) {
          isLoading = false;
        }
      }
    };

    loadData();

    return () => {
      aborted = true;
    };
  });

  // === HANDLERS =================================================================================

  function handleBack() {
    goto(`/categories/${categoryId}/productdefinitions/${productDefId}/images`);
  }
</script>

<!-- TEMPLATE -->

<div class="image-detail-page">
  <div class="page-header">
    <h1>{isCreateMode ? "Create New Image" : `Edit Image ${imageId}`}</h1>
    <button onclick={handleBack}>Back to Images</button>
  </div>

  {#if isLoading}
    <div class="loading">Loading image details...</div>
  {:else}
    <div class="placeholder">
      <p>Image Detail Form - Coming Soon</p>
      <p>imageId: {imageId}</p>
      <p>productDefId: {productDefId}</p>
      <p>categoryId: {categoryId}</p>
      {#if image}
        <pre>{JSON.stringify(image, null, 2)}</pre>
      {/if}
    </div>
  {/if}
</div>

<style>
  .image-detail-page {
    padding: 2rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .loading {
    padding: 2rem;
    text-align: center;
  }

  .placeholder {
    padding: 2rem;
    border: 2px dashed var(--color-border);
    border-radius: 8px;
  }

  pre {
    background: var(--color-background);
    padding: 1rem;
    border-radius: 4px;
    overflow: auto;
  }
</style>
