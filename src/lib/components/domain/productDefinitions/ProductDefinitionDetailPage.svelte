<!-- File: src/lib/components/domain/productDefinitions/ProductDefinitionDetailPage.svelte (FINAL) -->

<script lang="ts">
  import { goto } from "$app/navigation";
  import { ApiClient } from "$lib/api/client/apiClient";
  import { getOfferingApi, offeringLoadingState } from "$lib/api/client/offering";
  import { getProductDefinitionImageApi, productDefinitionImageLoadingState } from "$lib/api/client/productDefinitionImage";
  import type { ColumnDef, DeleteStrategy, ID, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import {
    FormSchema,
    MaterialSchema,
    ProductDefinitionSchema,
    Wio_PDef_Cat_Supp_Nested_WithLinks_Schema,
    type Form,
    type Material,
    type ProductDefinition,
    type WholesalerItemOffering,
    type Wio_PDef_Cat_Supp_Nested_WithLinks,
    type Wio_PDef_Cat_Supp,
    type ConstructionType,
    type SurfaceFinish,
    ConstructionTypeSchema,
    SurfaceFinishSchema,
    ProductCategorySchema,
    type ProductCategory,
    ProductDefinitionImage_Image_Schema,
    type ProductDefinitionImage_Image,
    ProductDefinitionImage_Image_ProductDef_Schema,
  } from "$lib/domain/domainTypes";
  import { addNotification } from "$lib/stores/notifications";
  import { log } from "$lib/utils/logger";
  // Component Imports
  import OfferingGrid from "$lib/components/domain/offerings/OfferingGrid.svelte";
  import ProductDefinitionForm from "./ProductDefinitionForm.svelte";
  import Datagrid from "$lib/components/grids/Datagrid.svelte";
  // The new form component
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/grid-section.css";
  import "$lib/components/styles/form-elements.css";
  // Type and Schema Imports
  import { page } from "$app/state";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { getFormApi } from "$lib/api/client/form";
  import { getMaterialApi } from "$lib/api/client/material";
  import { getProductDefinitionApi } from "$lib/api/client/productDefinition";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { safeParseFirstN, zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import { assertDefined } from "$lib/utils/assertions";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { buildChildUrl, buildSiblingUrl } from "$lib/utils/url";
  import { error } from "@sveltejs/kit";
  import { getErrorMessage } from "$lib/api/client/common";
  import type { SortDescriptor, QueryPayload } from "$lib/backendQueries/queryGrammar";
  import { ComparisonOperator } from "$lib/backendQueries/queryGrammar";
  import { getSurfaceFinishApi } from "$lib/api/client/surfaceFinish";
  import { getConstructionTypeApi } from "$lib/api/client/constructionType";
  import { getProductCategoryApi } from "$lib/api/client/productCategory";

  // === TYPES ====================================================================================

  // TODO: Validate through typing, derived from navigationHierarchieConfig.
  export type ProductDefChildRelationships = "offerings" | "images";

  // === PROPS ====================================================================================

  export type ProductDefPageProps = {
    productDefId: number;
    categoryId: number;
    isCreateMode: boolean;
    activeChildPath: ProductDefChildRelationships;
    loadEventFetch: typeof fetch;
  };

  const { productDefId, categoryId, isCreateMode, loadEventFetch, activeChildPath }: ProductDefPageProps = $props();

  // === STATE ====================================================================================

  let isLoading = $state(true);
  const errors = $state<Record<string, ValidationErrorTree>>({});
  const allowForceCascadingDelte = $state(true);
  let productDefinition: ProductDefinition | null = $state(null);
  let offerings: Wio_PDef_Cat_Supp_Nested_WithLinks[] = $state([]);
  let images: ProductDefinitionImage_Image[] = $state([]);
  let constructionTypes: ConstructionType[] = $state([]);
  let surfaceFinishes: SurfaceFinish[] = $state([]);
  let materials: Material[] = $state([]);
  let forms: Form[] = $state([]);
  let categories: ProductCategory[] = $state([]);
  let allowForceCascadingDelete = $state(true);

  // === API ======================================================================================

  const client = new ApiClient(loadEventFetch);
  const productDefinitionApi = getProductDefinitionApi(client);
  const surfaceFinishApi = getSurfaceFinishApi(client);
  const constructionTypeApi = getConstructionTypeApi(client);
  const productCategoryApi = getProductCategoryApi(client);
  const offeringApi = getOfferingApi(client);
  const materialApi = getMaterialApi(client);
  const formApi = getFormApi(client);
  const productDefinitionImageApi = getProductDefinitionImageApi(client);

  // === LOAD DATA ================================================================================

  $effect(() => {
    log.debug(`++++ data props:`, { productDefId, categoryId, isCreateMode, loadEventFetch });

    let aborted = false;
    const processPromises = async () => {
      isLoading = true;

      try {
        if (isCreateMode) {
          log.debug(`Create Mode`);

          // Load dropdown data for form
          constructionTypes = await constructionTypeApi.loadConstructionTypes();
          if (aborted) return;
          const constructionTypesVal = safeParseFirstN(ConstructionTypeSchema, constructionTypes, 3);
          if (!constructionTypesVal.success) {
            errors.constructionTypes = zodToValidationErrorTree(constructionTypesVal.error);
          }

          surfaceFinishes = await surfaceFinishApi.loadSurfaceFinishes();
          const surfaceFinishesVal = safeParseFirstN(SurfaceFinishSchema, surfaceFinishes, 3);
          if (aborted) return;
          if (!surfaceFinishesVal.success) {
            errors.surfaceFinishes = zodToValidationErrorTree(surfaceFinishesVal.error);
          }

          categories = await productCategoryApi.loadProductCategories();
          const categoriesVal = safeParseFirstN(ProductCategorySchema, categories, 3);
          if (aborted) return;
          if (!categoriesVal.success) {
            errors.categories = zodToValidationErrorTree(categoriesVal.error);
          }
        } else {
          if (isNaN(productDefId) || productDefId < 0) {
            throw error(400, "ProductDefintionDetailPage::$effect: Invalid Product Definition ID. Must be a positive number.");
          }
          // We must always come from a path like /.../categories/[categoryId]
          if (isNaN(categoryId) || categoryId < 0) {
            throw error(400, "categoryId must be passed in params.");
          }

          productDefinition = await productDefinitionApi.loadProductDefinition(productDefId);
          if (aborted) return;
          const prodDefVal = ProductDefinitionSchema.nullable().safeParse(productDefinition);
          if (!prodDefVal.success) {
            errors.productDefintion = zodToValidationErrorTree(prodDefVal.error);
          }

          offerings = await productDefinitionApi.loadNestedOfferingsWithLinksForProductDefinition(productDefId);
          if (aborted) return;
          const offeringsVal = safeParseFirstN(Wio_PDef_Cat_Supp_Nested_WithLinks_Schema, offerings, 3);
          if (!offeringsVal.success) {
            errors.offerings = zodToValidationErrorTree(offeringsVal.error);
          }

          images = await productDefinitionImageApi.loadProductDefinitionImagesForProduct(productDefId);
          if (aborted) return;
          const imagesVal = safeParseFirstN(ProductDefinitionImage_Image_Schema, images, 3);
          if (!imagesVal.success) {
            errors.images = zodToValidationErrorTree(imagesVal.error);
          }

          constructionTypes = await constructionTypeApi.loadConstructionTypes();
          if (aborted) return;
          const constructionTypesVal = safeParseFirstN(ConstructionTypeSchema, constructionTypes, 3);
          if (!constructionTypesVal.success) {
            errors.constructionTypes = zodToValidationErrorTree(constructionTypesVal.error);
          }

          surfaceFinishes = await surfaceFinishApi.loadSurfaceFinishes();
          const surfaceFinishesVal = safeParseFirstN(SurfaceFinishSchema, surfaceFinishes, 3);
          if (aborted) return;
          if (!surfaceFinishesVal.success) {
            errors.surfaceFinishes = zodToValidationErrorTree(surfaceFinishesVal.error);
          }

          categories = await productCategoryApi.loadProductCategories();
          const categoriesVal = safeParseFirstN(ProductCategorySchema, categories, 3);
          if (aborted) return;
          if (!categoriesVal.success) {
            errors.categories = zodToValidationErrorTree(categoriesVal.error);
          }

          log.debug(`Loaded productDefinition and offerings.`, { productDefinition, offerings });
        }

        forms = await formApi.loadForms();
        if (aborted) return;
        const formsVal = safeParseFirstN(FormSchema, forms, 3);
        if (!formsVal.success) {
          errors.forms = zodToValidationErrorTree(formsVal.error);
        }

        materials = await materialApi.loadMaterials();
        if (aborted) return;
        const materialsVal = safeParseFirstN(MaterialSchema, materials, 3);
        if (!materialsVal.success) {
          errors.materials = zodToValidationErrorTree(materialsVal.error);
        }
        log.debug(`Loaded forms and materials.`, { forms, materials });

        //
      } catch (rawError: any) {
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load product definition details.";

        // If the API returned validation errors, include them
        if (rawError.errors) {
          errors.unexpectedError = { message, status, validationErrors: rawError.errors };
          log.error("Promise processing failed with validation errors", { rawError, validationErrors: rawError.errors });
        } else {
          errors.unexpectedError = { message, status };
          log.error("Promise processing failed in ProductDefinitionDetailPage", { rawError });
        }
      } finally {
        if (!aborted) {
          isLoading = false;
        }
      }
    };

    processPromises();
    return () => {
      aborted = true;
    };
  });

  // === API & STRATEGIES =========================================================================

  async function reloadOfferings() {
    assertDefined(productDefinition, "productDefinition");
    assertDefined(productDefId, "productDefId");

    log.info(`Re-fetching offerings for productDefId: ${productDefId}`);
    const updatedOfferings = await productDefinitionApi.loadNestedOfferingsWithLinksForProductDefinition(productDefId);
    offerings = updatedOfferings;
    log.info("Local state for offerings updated.");
  }

  // === OFFERINGS GRID/BUSINESS LOGIC ============================================================

  function handleOfferingCreate(): void {
    log.info(`Navigating to create new offering.`);
    goto(buildChildUrl(page.url.pathname, "offerings", "new"));
  }

  function handleOfferingSelect(offering: Wio_PDef_Cat_Supp) {
    log.info(`Selected offering: `, offering);
    const { wholesaler_id, category_id, offering_id, product_def_id } = offering;
    if (wholesaler_id && category_id && offering_id && product_def_id) {
      const targetUrl = buildChildUrl(page.url.pathname, "offerings", offering_id);
      log.debug(`Going to: ${targetUrl}`);
      goto(targetUrl);
    } else {
      log.error("Cannot navigate to offering, missing IDs", { offering });
      addNotification("Cannot navigate: offering data is incomplete.", "error");
    }
  }

  async function handleOfferingDelete(ids: ID[]): Promise<void> {
    let dataChanged = false;
    const idsAsNumber = stringsToNumbers(ids);

    dataChanged = await cascadeDelete(
      idsAsNumber,
      offeringApi.deleteOffering,
      {
        domainObjectName: "Product Definition",
        softDepInfo: "Product Definition has soft dependencies.",
        hardDepInfo: "Product Definition has hard dependencies.",
      },
      allowForceCascadingDelte,
    );

    if (dataChanged) {
      await reloadOfferings();
    }
  }

  async function handleOfferingsSort(sortState: SortDescriptor<Wio_PDef_Cat_Supp_Nested_WithLinks>[] | null) {
    try {
      // Type assertion is safe here because SortDescriptor only uses keys that exist in both types
      offerings = await productDefinitionApi.loadNestedOfferingsWithLinksForProductDefinition(
        productDefId,
        null,
        sortState as SortDescriptor<WholesalerItemOffering>[] | null
      );
    } catch (e: unknown) {
      addNotification(`Error during sorting API: ${getErrorMessage(e)}`);
    }
  }

  const deleteStrategy: DeleteStrategy<Wio_PDef_Cat_Supp> = {
    execute: handleOfferingDelete,
  };

  const rowActionStrategy: RowActionStrategy<Wio_PDef_Cat_Supp> = {
    click: handleOfferingSelect,
    doubleClick: handleOfferingSelect,
  };

  // === IMAGES GRID ==============================================================================

  async function reloadImages() {
    assertDefined(productDefinition, "productDefinition");
    assertDefined(productDefId, "productDefId");

    log.info(`Re-fetching images for productDefId: ${productDefId}`);
    const updatedImages = await productDefinitionImageApi.loadProductDefinitionImagesForProduct(productDefId);
    images = updatedImages;
    log.info("Local state for images updated.");
  }

  function handleImageCreate(): void {
    log.info(`Navigating to create new image.`);
    goto(buildChildUrl(page.url.pathname, "images", "new"));
  }

  function handleImageSelect(image: ProductDefinitionImage_Image) {
    log.info(`Selected image: `, image);
    const { image_id } = image;
    if (image_id) {
      const targetUrl = buildChildUrl(page.url.pathname, "images", image_id);
      log.debug(`Going to: ${targetUrl}`);
      goto(targetUrl);
    } else {
      log.error("Cannot navigate to image, missing image_id", { image });
      addNotification("Cannot navigate: image data is incomplete.", "error");
    }
  }

  async function handleImageDelete(ids: ID[]): Promise<void> {
    let dataChanged = false;
    const idsAsNumber = stringsToNumbers(ids);

    dataChanged = await cascadeDelete(
      idsAsNumber,
      productDefinitionImageApi.deleteProductDefinitionImage,
      {
        domainObjectName: "Image",
        softDepInfo: "Image has soft dependencies.",
        hardDepInfo: "Image has hard dependencies.",
      },
      allowForceCascadingDelete,
    );

    if (dataChanged) {
      await reloadImages();
    }
  }

  async function handleImagesSort(sortState: SortDescriptor<ProductDefinitionImage_Image>[] | null) {
    try {
      const query: Partial<QueryPayload<ProductDefinitionImage_Image>> = {
        where: {
          key: "pdi.product_def_id" as keyof ProductDefinitionImage_Image,
          whereCondOp: "=" as ComparisonOperator,
          val: productDefId,
        },
        ...(sortState && { orderBy: sortState }),
      };
      images = await productDefinitionImageApi.loadProductDefinitionImages(query);
    } catch (e: unknown) {
      addNotification(`Error during sorting API: ${getErrorMessage(e)}`);
    }
  }

  const imagesDeleteStrategy: DeleteStrategy<ProductDefinitionImage_Image> = {
    execute: handleImageDelete,
  };

  const imagesRowActionStrategy: RowActionStrategy<ProductDefinitionImage_Image> = {
    click: handleImageSelect,
    doubleClick: handleImageSelect,
  };

  const imagesColumns: ColumnDef<typeof ProductDefinitionImage_Image_ProductDef_Schema>[] = [
    { key: "pdi.image_id", header: "ID", accessor: (img) => img.image_id, sortable: true },
    { key: "img.filename", header: "Filename", accessor: (img) => img.image.filename || "—", sortable: true },
    { key: "pdi.image_type", header: "Type", accessor: (img) => img.image_type || "—", sortable: true },
    { key: "pdi.size_range", header: "Size Range", accessor: (img) => img.size_range || "—", sortable: true },
    { key: "pdi.quality_grade", header: "Quality", accessor: (img) => img.quality_grade || "—", sortable: true },
    { key: "pdi.color_variant", header: "Color", accessor: (img) => img.color_variant || "—", sortable: true },
    { key: "pdi.sort_order", header: "Sort", accessor: (img) => img.sort_order, sortable: true },
    { key: "pdi.is_primary", header: "Primary", accessor: (img) => img.is_primary ? "Yes" : "No", sortable: true },
  ];

  const getImageRowId = (image: ProductDefinitionImage_Image) => image.image_id;

  // === FORM EVENT HANDLERS =======================================================================

  function handleFormSubmitted(event: { data: ProductDefinition; result: unknown }) {
    addNotification("Product Definition saved successfully.", "success");
    if (isCreateMode) {
      const newId = event.data?.product_def_id;
      if (newId) {
        // Redirect to the new edit page
        goto(buildSiblingUrl(page.url.pathname, newId), { invalidateAll: true });
      } else {
        addNotification("Could not redirect to edit page, ID is missing.", "error", 4000);
      }
    } else {
      // In edit mode, the FormShell has already updated the state.
      // We might want to force-reload all data to be safe.
      // For now, we assume the form's state is sufficient.
    }
  }

  function handleFormSubmitError(event: { data: ProductDefinition; error: unknown }) {
    log.error("Form submit error in ProductDefinitionDetailPage", event.error);
    addNotification(`Failed to save Product Definition. ${getErrorMessage(event.error)}`, "error");
  }

  function handleFormCancelled() {
    addNotification("Changes discarded.", "info");
  }

  function handleFormChanged(event: { data: ProductDefinition; dirty: boolean }) {
    log.debug("Form data changed", { dirty: event.dirty });
  }
</script>

<!------------------------------------------------------------------------------------------------
  SNIPPETS 
  ------------------------------------------------------------------------------------------------>

<!-- Offerings ----------------------------------------------------------------------------------->

{#snippet offeringsSection()}
  <div class="grid-section">
    {#if !isCreateMode}
      <h2>Offerings for this Product</h2>
      <button
        class="pc-grid__createbtn"
        onclick={handleOfferingCreate}
      >
        Create Offering
      </button>
      <OfferingGrid
        rows={offerings}
        loading={$offeringLoadingState}
        {deleteStrategy}
        {rowActionStrategy}
        onSort={handleOfferingsSort}
      />
    {:else}
      <p>Offerings will be displayed here after the product definition has been saved.</p>
    {/if}
  </div>
{/snippet}


{#snippet imagesSection()}
  <div class="grid-section">
    {#if !isCreateMode}
      <h2>Images for this Product</h2>
      <button
        class="pc-grid__createbtn"
        onclick={handleImageCreate}
      >
        Create Image
      </button>
      <Datagrid
        rows={images}
        columns={imagesColumns}
        getId={getImageRowId}
        loading={$productDefinitionImageLoadingState}
        gridId="images"
        entity="image"
        deleteStrategy={imagesDeleteStrategy}
        rowActionStrategy={imagesRowActionStrategy}
        onSort={handleImagesSort}
      />
    {:else}
      <p>Images will be displayed here after the product definition has been saved.</p>
    {/if}
  </div>
{/snippet}

<!-- Images -------------------------------------------------------------------------------------->

<!------------------------------------------------------------------------------------------------
  TEMPLATE 
  ------------------------------------------------------------------------------------------------>

<ValidationWrapper {errors}>
  {#if isLoading}
    <div class="detail-page-layout">Loading details...</div>
  {:else}
    <div class="detail-page-layout">
      <!-- Section 1: Product Definition Form -->
      <div class="form-section">
        <ProductDefinitionForm
          {categoryId}
          {isCreateMode}
          initial={productDefinition}
          {forms}
          {materials}
          {constructionTypes}
          {surfaceFinishes}
          {categories}
          onSubmitted={handleFormSubmitted}
          onSubmitError={handleFormSubmitError}
          onCancelled={handleFormCancelled}
          onChanged={handleFormChanged}
        />
      </div>

      {#if "offerings" === activeChildPath}
        <!-- Offerings -->
        {@render offeringsSection()}
      {:else if "images" === activeChildPath}
        {@render imagesSection()}
      {:else}
        <div class="error-boundary">
          <p>Wrong active child path, must be "offerings" or "images" but was: {activeChildPath}</p>
        </div>
      {/if}
    </div>
  {/if}
</ValidationWrapper>

<style>
  .form-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
    /* No padding here, as the FormShell/Form component handles it */
  }
</style>
