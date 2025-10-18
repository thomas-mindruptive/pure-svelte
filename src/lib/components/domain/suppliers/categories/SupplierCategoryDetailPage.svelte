<!-- src/lib/pages/categories/CategoryDetailPage.svelte -->
<script lang="ts">
  // ========================================================================
  // IMPORTS
  // ========================================================================

  import { log } from "$lib/utils/logger";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  // Component Imports
  import "$lib/components/styles/grid-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import OfferingGrid from "$lib/components/domain/offerings/OfferingGrid.svelte";

  // API & Type Imports
  import { categoryLoadingState, getCategoryApi } from "$lib/api/client/category";
  import type { Wio_PDef_Cat_Supp } from "$lib/domain/domainTypes";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import {
    SupplierCategoryDetailPage_LoadDataSchema,
    type SupplierCategoryDetailPage_LoadData,
    type SupplierCategoryDetailPage_LoadDataAsync,
  } from "./supplierCategoryDetailPage.types";
  import { getOfferingApi } from "$lib/api/client/offering";
  import { assertDefined } from "$lib/utils/assertions";
    import { cascadeDelete } from "$lib/api/client/cascadeDelete";
    import { stringsToNumbers } from "$lib/utils/typeConversions";
  import { buildChildUrl } from "$lib/utils/url";

  // ========================================================================
  // PROPS
  // ========================================================================

  // This interface now correctly matches the type returned by our new `load` function.
  interface CategoryDetailPageProps {
    data: SupplierCategoryDetailPage_LoadDataAsync;
  }

  const { data }: CategoryDetailPageProps = $props();

  // ========================================================================
  // API
  // ========================================================================

  const client = new ApiClient(fetch);
  const categoryApi = getCategoryApi(client);
  const offeringApi = getOfferingApi(client);

  // ========================================================================
  // STATE & DATA PROCESSING
  // ========================================================================

  let resolvedData = $state<SupplierCategoryDetailPage_LoadData | null>(null);
  let isLoading = $state(true);
  let loadingError = $state<{ message: string; status?: number } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // This `$effect` hook resolves the promises passed in the `data` prop.
  $effect(() => {
    let aborted = false;
    const processPromises = async () => {
      isLoading = true;
      loadingError = null;
      resolvedData = null;

      try {
        const [assignmentDetails, offerings] = await Promise.all([data.assignmentDetails, data.offerings]);

        if (aborted) return;

        // Assemble the data object for Zod validation.
        const dataToValidate = { assignmentDetails, offerings };
        const validationResult = SupplierCategoryDetailPage_LoadDataSchema.safeParse(dataToValidate);

        if (!validationResult.success) {
          log.error("Zod validation failed", validationResult.error.issues);
          throw new Error(
            `SupplierCategoryDetailPage: Received invalid data structure from the API: ${JSON.stringify(validationResult.error.issues)}`,
          );
        }

        resolvedData = validationResult.data;
        log.info("(CategoryDetailPage) Successfully loaded and validated data:", resolvedData);
      } catch (rawError: any) {
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load category details.";
        loadingError = { message, status };
        log.error("(CategoryDetailPage) Promise processing failed", { rawError });
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

  // ========================================================================
  // FUNCTIONS & EVENT HANDLERS
  // ========================================================================

  async function reloadOfferings() {
    assertDefined(resolvedData, "reloadOfferings needs resolvedData", ["assignmentDetails"]);
    const { wholesaler_id, category_id } = resolvedData.assignmentDetails;
    log.info(`Re-fetching offerings for supplier ${wholesaler_id}, category ${category_id}`);
    const updatedOfferings = await categoryApi.loadOfferingsForSupplierCategory(wholesaler_id, category_id);
    resolvedData.offerings = updatedOfferings;
    log.info("Local state for offerings updated.");
  }

  function handleOfferingCreate(): void {
    log.info(`(CategoryDetailPage) Navigating to create new offering page.`);
    goto(buildChildUrl(page.url.pathname, "offerings", "new"));
  }

  function handleOfferingSelect(offering: Wio_PDef_Cat_Supp): void {
    log.info(`(CategoryDetailPage) Navigating to offering detail for offeringId: ${offering.offering_id}`);
    goto(buildChildUrl(page.url.pathname, "offerings", offering.offering_id));
  }

  async function handleOfferingDelete(ids: ID[]): Promise<void> {
    let dataChanged = false;
    const idsAsNumber = stringsToNumbers(ids);

    dataChanged = await cascadeDelete(
      idsAsNumber,
      offeringApi.deleteOffering,
      {
        domainObjectName: "Offering",
        softDepInfo: "This will also delete all assigned attributes and links.",
        hardDepInfo: "",
      },
      allowForceCascadingDelte,
    );

    if (dataChanged) {
      await reloadOfferings();
    }
  }

  // ========================================================================
  // GRID STRATEGIES
  // ========================================================================

  const deleteStrategy: DeleteStrategy<Wio_PDef_Cat_Supp> = {
    execute: handleOfferingDelete,
  };

  const rowActionStrategy: RowActionStrategy<Wio_PDef_Cat_Supp> = {
    click: handleOfferingSelect,
    doubleClick: handleOfferingSelect
  };
</script>

<!-- ======================================================================== -->
<!-- TEMPLATE -->
<!-- ======================================================================== -->

{#if loadingError}
  <div class="component-error-boundary">
    <h3>Error Loading Category (Status: {loadingError.status})</h3>
    <p>{loadingError.message}</p>
  </div>
{:else if isLoading || !resolvedData}
  <div class="detail-page-layout">
    <div class="detail-header-section">
      <h1>Loading Offerings...</h1>
      <p>Please wait while we fetch the details for this category.</p>
    </div>
  </div>
{:else if !resolvedData.assignmentDetails}
  <div class="component-error-boundary">
    <h3>Category Assignment Not Found</h3>
    <p>The selected category does not seem to be assigned to this supplier.</p>
  </div>
{:else}
  <div class="detail-page-layout">
    <div class="detail-header-section">
      <h1>Offerings in "{resolvedData.assignmentDetails.category_name}"</h1>
      <p>{resolvedData.assignmentDetails.category_name || "No name available for this category."}</p>

      {#if resolvedData.assignmentDetails.comment}
        <p class="comment">
          <strong>Supplier Notes:</strong>
          {resolvedData.assignmentDetails.comment}
        </p>
      {/if}
    </div>

    <div class="grid-section">
      <button
        class="pc-grid__createbtn"
        onclick={handleOfferingCreate}
      >
        Create Offering
      </button>
      <OfferingGrid
        rows={resolvedData.offerings}
        loading={$categoryLoadingState}
        {deleteStrategy}
        {rowActionStrategy}
      />
    </div>
  </div>
{/if}

<!-- ======================================================================== -->
<!-- STYLES -->
<!-- ======================================================================== -->

<style>
  h1 {
    margin: 0;
  }
  p {
    margin: 0.5rem 0 0 0;
    color: var(--color-muted);
    max-width: 80ch;
  }
  .comment {
    font-style: italic;
    margin-top: 0.75rem;
    border-left: 3px solid var(--color-primary);
    padding-left: 1rem;
    background-color: color-mix(in srgb, var(--color-primary) 5%, transparent);
  }
  .grid-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }
</style>
