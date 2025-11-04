<!-- File: src/lib/components/domain/offeringImages/ImageDetailPage.svelte -->

<script lang="ts">
  import { goto } from "$app/navigation";
  import { ApiClient } from "$lib/api/client/apiClient";
  import { getOfferingImageApi, offeringImageLoadingState } from "$lib/api/client/offeringImage";
  import { getMaterialApi } from "$lib/api/client/material";
  import { getFormApi } from "$lib/api/client/form";
  import { getConstructionTypeApi } from "$lib/api/client/constructionType";
  import { getSurfaceFinishApi } from "$lib/api/client/surfaceFinish";
  import type { OfferingImage_Image, Material, Form, ConstructionType, SurfaceFinish } from "$lib/domain/domainTypes";
  import { addNotification } from "$lib/stores/notifications";
  import { log } from "$lib/utils/logger";
  import { browser } from "$app/environment";
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/form-elements.css";
  import ImageForm from "./ImageForm.svelte";

  // === TYPES ====================================================================================

  export type ImageDetailPageProps = {
    imageId: number | "new";
    offeringId: number;
    productDefId?: number | undefined;
    categoryId: number;
    supplierId?: number | undefined;
    isCreateMode: boolean;
    isSuppliersRoute: boolean;
  };

  const { imageId, offeringId, productDefId, categoryId, supplierId, isCreateMode, isSuppliersRoute }: ImageDetailPageProps = $props();

  // === STATE ====================================================================================

  let isLoading = $state(true);
  let image: OfferingImage_Image | null = $state(null);
  let materials: Material[] = $state([]);
  let forms: Form[] = $state([]);
  let constructionTypes: ConstructionType[] = $state([]);
  let surfaceFinishes: SurfaceFinish[] = $state([]);

  // === API ======================================================================================

  const client = new ApiClient(fetch);
  const imageApi = getOfferingImageApi(client);
  const materialApi = getMaterialApi(client);
  const formApi = getFormApi(client);
  const constructionTypeApi = getConstructionTypeApi(client);
  const surfaceFinishApi = getSurfaceFinishApi(client);

  // === LOAD DATA ================================================================================

  $effect(() => {
    log.debug(`OfferingImageDetailPage $effect`, { imageId, offeringId, productDefId, categoryId, supplierId, isCreateMode, isSuppliersRoute });

    if (!browser) return;

    let aborted = false;

    const loadData = async () => {
      isLoading = true;

      try {
        // Load lookups and image data in parallel
        const [materialsData, formsData, constructionTypesData, surfaceFinishesData, imageData] = await Promise.all([
          materialApi.loadMaterials(),
          formApi.loadForms(),
          constructionTypeApi.loadConstructionTypes(),
          surfaceFinishApi.loadSurfaceFinishes(),
          !isCreateMode && typeof imageId === "number"
            ? imageApi.loadOfferingImage(imageId)
            : Promise.resolve(null),
        ]);

        if (aborted) return;

        materials = materialsData;
        forms = formsData;
        constructionTypes = constructionTypesData;
        surfaceFinishes = surfaceFinishesData;

        if (!isCreateMode && imageData) {
          image = imageData;
          log.debug(`Loaded image`, { image });
        } else {
          // Create mode - initialize with empty structure and defaults
          image = {
            offering_id: offeringId,
            sort_order: 0,
            is_primary: false,
            image_type: null,
            size_range: null,
            quality_grade: null,
            color_variant: null,
            image: {
              filename: "",
              filepath: "",
              file_hash: null,
              file_size_bytes: null,
              width_px: null,
              height_px: null,
              mime_type: null,
              shopify_url: null,
              shopify_media_id: null,
              uploaded_to_shopify_at: null,
            },
          } as Partial<OfferingImage_Image> as OfferingImage_Image;
        }
      } catch (err: any) {
        if (aborted) return;
        const message = err.message || "Failed to load image or lookup data.";
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
    if (isSuppliersRoute) {
      goto(`/suppliers/${supplierId}/categories/${categoryId}/offerings/${offeringId}/images`);
    } else {
      goto(`/categories/${categoryId}/productdefinitions/${productDefId}/offerings/${offeringId}/images`);
    }
  }

  async function handleFormSubmitted(info: { data: OfferingImage_Image; result: unknown }) {
    log.info(`Image ${isCreateMode ? "created" : "updated"} successfully`, info.result);
    addNotification(`Image ${isCreateMode ? "created" : "updated"} successfully.`, "success");

    if (isCreateMode) {
      // After creating, navigate to the edit page for the new image
      const createdImage = info.result as OfferingImage_Image;
      if (createdImage?.image_id) {
        if (isSuppliersRoute) {
          goto(`/suppliers/${supplierId}/categories/${categoryId}/offerings/${offeringId}/images/${createdImage.image_id}`);
        } else {
          goto(`/categories/${categoryId}/productdefinitions/${productDefId}/offerings/${offeringId}/images/${createdImage.image_id}`);
        }
      } else {
        addNotification("Could not redirect to edit page, returning to image list.", "error");
        handleBack();
      }
    } else {
      // In edit mode, reload the image to show updated data
      if (typeof imageId === "number") {
        image = await imageApi.loadOfferingImage(imageId);
      }
    }
  }

  async function handleFormSubmitError(info: { data: OfferingImage_Image; error: unknown }) {
    log.error(`Image submit error`, info.error);
    addNotification(`Image submit error: ${info.error}`, "error");
  }

  async function handleFormCancelled(info: { data: OfferingImage_Image; reason?: string }) {
    log.debug(`Image form cancelled`);
    addNotification(`Form cancelled.`, "info");
    handleBack();
  }

  async function handleFormChanged(event: { data: Record<string, any> }) {
    log.debug(`Image form changed`);
  }
</script>

<!-- TEMPLATE -->

{#if isLoading}
  <div class="detail-page-layout">Loading image details...</div>
{:else}
  <div class="detail-page-layout">
    <div class="page-header">
      <h1>{isCreateMode ? "Create New Image" : `Edit Image ${imageId}`}</h1>
      <button class="secondary-button" onclick={handleBack}>Back to Images</button>
    </div>

    <div class="form-section">
      <ImageForm
        initial={image}
        {offeringId}
        {isCreateMode}
        {materials}
        {forms}
        {constructionTypes}
        {surfaceFinishes}
        disabled={$offeringImageLoadingState}
        onSubmitted={handleFormSubmitted}
        onSubmitError={handleFormSubmitError}
        onCancelled={handleFormCancelled}
        onChanged={handleFormChanged}
      />
    </div>
  </div>
{/if}

<style>
  /* Page-specific header layout with button */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .page-header h1 {
    margin: 0;
  }

  /* Form container styling */
  .form-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }
</style>
