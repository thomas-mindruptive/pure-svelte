<!-- src/lib/pages/categories/CategoryDetailPage.svelte -->
<script lang="ts">
  // ========================================================================
  // IMPORTS
  // ========================================================================

  import { log } from "$lib/utils/logger";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { getContext } from "svelte";

  // Component Imports
  import "$lib/components/styles/grid-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import OfferingGrid from "$lib/components/domain/offerings/OfferingGrid.svelte";

  // API & Type Imports
  import type { Wio_PDef_Cat_Supp_Nested_WithLinks, WholesalerItemOffering } from "$lib/domain/domainTypes";
  import { ApiClient } from "$lib/api/client/apiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { WhereCondition, WhereConditionGroup, SortDescriptor } from "$lib/backendQueries/queryGrammar";
  import { ComparisonOperator } from "$lib/backendQueries/queryGrammar";
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
  const offeringApi = getOfferingApi(client);

  // ========================================================================
  // STATE & DATA PROCESSING
  // ========================================================================

  let resolvedData = $state<SupplierCategoryDetailPage_LoadData | null>(null);
  let isLoading = $state(true);
  let loadingError = $state<{ message: string; status?: number } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // Get page-local loading context from layout
  type PageLoadingContext = { isLoading: boolean };
  const pageLoading = getContext<PageLoadingContext>('page-loading');

  // This `$effect` hook resolves the promises passed in the `data` prop.
  $effect(() => {
    let aborted = false;
    const processPromises = async () => {
      isLoading = true;
      pageLoading.isLoading = true;  // Globaler Spinner AN
      loadingError = null;
      resolvedData = null;

      try {
        // <refact01> CHANGED: No more assignmentDetails - await category and offerings
        const [category, offerings] = await Promise.all([data.category, data.offerings]);

        if (aborted) return;

        // <refact01> CHANGED: Assemble with supplierId, categoryId from data (not promises)
        const dataToValidate = {
          supplierId: data.supplierId,
          categoryId: data.categoryId,
          category,
          offerings
        };
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
          pageLoading.isLoading = false;  // Globaler Spinner AUS
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

  async function handleQueryChange(query: {
    filters: WhereCondition<Wio_PDef_Cat_Supp_Nested_WithLinks> | WhereConditionGroup<Wio_PDef_Cat_Supp_Nested_WithLinks> | null,
    sort: SortDescriptor<Wio_PDef_Cat_Supp_Nested_WithLinks>[] | null
  }): Promise<void> {
    assertDefined(resolvedData, "handleQueryChange needs resolvedData");
    const { supplierId, categoryId } = resolvedData;
    
    // Base filter: always filter by supplierId and categoryId
    const baseFilter: WhereConditionGroup<Wio_PDef_Cat_Supp_Nested_WithLinks> = {
      whereCondOp: "AND",
      conditions: [
        { key: "wio.wholesaler_id", whereCondOp: ComparisonOperator.EQUALS, val: supplierId },
        { key: "wio.category_id", whereCondOp: ComparisonOperator.EQUALS, val: categoryId },
      ],
    };

    // Combine base filter with user filters
    let finalWhere: WhereConditionGroup<Wio_PDef_Cat_Supp_Nested_WithLinks> | WhereCondition<Wio_PDef_Cat_Supp_Nested_WithLinks>;
    if (query.filters) {
      finalWhere = {
        whereCondOp: "AND",
        conditions: [baseFilter, query.filters],
      };
    } else {
      finalWhere = baseFilter;
    }

    log.info(`Re-fetching offerings for supplier ${supplierId}, category ${categoryId} with filters and sort`);
    // Type cast: Filter keys (wio.*) are compatible between Wio_PDef_Cat_Supp_Nested_WithLinks and WholesalerItemOffering
    const updatedOfferings = await offeringApi.loadNestedOfferingsWithLinks(
      finalWhere as WhereConditionGroup<WholesalerItemOffering> | WhereCondition<WholesalerItemOffering>,
      query.sort as SortDescriptor<WholesalerItemOffering>[] | null
    );
    resolvedData.offerings = updatedOfferings;
    log.info("Local state for offerings updated.");
  }

  function handleOfferingCreate(): void {
    log.info(`(CategoryDetailPage) Navigating to create new offering page.`);
    goto(buildChildUrl(page.url.pathname, "offerings", "new"));
  }

  function handleOfferingSelect(offering: Wio_PDef_Cat_Supp_Nested_WithLinks, options?: { _blankWindow?: boolean }): void {
    const url = buildChildUrl(page.url.pathname, "offerings", offering.offering_id);
    if (options?._blankWindow) {
      log.info(`(CategoryDetailPage) Opening in new tab for offeringId: ${offering.offering_id}`);
      window.open(url, "_blank");
    } else {
      log.info(`(CategoryDetailPage) Navigating to offering detail for offeringId: ${offering.offering_id}`);
      goto(url);
    }
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
      // Reload with current filters/sort (if any)
      await handleQueryChange({ filters: null, sort: null });
    }
  }

  // ========================================================================
  // GRID STRATEGIES
  // ========================================================================

  const deleteStrategy: DeleteStrategy<Wio_PDef_Cat_Supp_Nested_WithLinks> = {
    execute: handleOfferingDelete,
  };

  const rowActionStrategy: RowActionStrategy<Wio_PDef_Cat_Supp_Nested_WithLinks> = {
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
{:else}
  <!-- <refact01> REMOVED: No more assignmentDetails check - category always exists -->
  <div class="detail-page-layout">
    <div class="detail-header-section">
      <!-- <refact01> CHANGED: Use category.name and category.description directly -->
      <h1>Offerings in "{resolvedData.category.name}"</h1>
      <p>{resolvedData.category.description || "No description available for this category."}</p>

      <!-- <refact01> REMOVED: No more assignmentDetails.comment -->
    </div>

    <div class="grid-section">
      <button
        class="pc-grid__createbtn"
        onclick={handleOfferingCreate}
        disabled={isLoading}
      >
        Create Offering
      </button>
      <OfferingGrid
        rows={resolvedData.offerings}
        {deleteStrategy}
        {rowActionStrategy}
        onQueryChange={handleQueryChange}
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
  /* <refact01> REMOVED: .comment style - no more assignmentDetails.comment */
  .grid-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }
</style>
