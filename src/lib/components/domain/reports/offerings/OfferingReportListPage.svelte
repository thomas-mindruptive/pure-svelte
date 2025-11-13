<script lang="ts">
  /**
   * OfferingReportListPage Component
   *
   * Page component for the Offerings Report.
   * Follows the Page Delegation Pattern: receives data from +page.ts and manages state/interactions.
   *
   * Key Features:
   * - Initial data load from route loader (Streaming Load Pattern)
   * - Server-side filtering via QueryGrammar (WhereCondition/WhereConditionGroup)
   * - Server-side sorting via SortDescriptor
   * - Loading state management
   * - Automatic state persistence via Datagrid2 (localStorage)
   *
   * Data Flow:
   * 1. Route loader (+page.ts) returns Promise<offerings> and fetch function
   * 2. $effect resolves initial Promise and populates grid
   * 3. Datagrid2 auto-restores filter/sort from localStorage on mount
   * 4. User filters/sorts -> handleQueryChange -> API call with combined where+sort
   * 5. Datagrid2 auto-saves new filter/sort to localStorage
   * 6. New data replaces grid contents
   */
  import { ApiClient } from "$lib/api/client/apiClient";
  import { getOfferingApi } from "$lib/api/client/offering";
  import OfferingReportGrid from "./OfferingReportGrid.svelte";
  import { getContext } from "svelte";
  import type {
    SortDescriptor,
    WhereCondition,
    WhereConditionGroup
  } from "$lib/backendQueries/queryGrammar";
  import type { OfferingReportViewWithLinks } from "$lib/domain/domainTypes";
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";
  import { getErrorMessage } from "$lib/api/client/common";

  type Props = {
    data: {
      // No more offerings Promise! Datagrid controls all loading
      loadEventFetch: typeof fetch;
    };
  };

  let { data }: Props = $props();
  let resolvedOfferings = $state<OfferingReportViewWithLinks[]>([]);
  let rawWhere = $state<string | null>(null);  // Superuser raw WHERE clause

  // Get page-local loading context from layout
  type PageLoadingContext = { isLoading: boolean };
  const pageLoading = getContext<PageLoadingContext>('page-loading');

  const client = new ApiClient(data.loadEventFetch);
  const offeringApi = getOfferingApi(client);

  // Track if we've done the first load
  let firstLoadComplete = false;

  /**
   * Query Change Handler
   *
   * Called by Datagrid when filters or sort changes.
   *
   * Note: Page tracks loading for error handling, Grid tracks its own loading for spinner.
   * They are independent - no coordination needed.
   */
  async function handleQueryChange(query: {
    filters: WhereCondition<any> | WhereConditionGroup<any> | null,
    sort: SortDescriptor<any>[] | null
  }) {
    log.info(`[OfferingReportListPage] Query change - filters:`, query.filters, `sort:`, query.sort);

    // Only show loading for subsequent queries, not the first one
    if (firstLoadComplete) {
      pageLoading.isLoading = true;
    }

    try {
      resolvedOfferings = await offeringApi.loadOfferingsForReportWithLinks(
        query.filters,
        query.sort,
        null,
        null,
        rawWhere  // Pass rawWhere to API
      );
      log.info(`[OfferingReportListPage] Received ${resolvedOfferings.length} offerings`);

      // First load is done, clear the initial loading state
      if (!firstLoadComplete) {
        firstLoadComplete = true;
        log.info("[OfferingReportListPage] First load complete");
      }
    } catch (err) {
      const message = getErrorMessage(err);
      addNotification(`Failed to load offerings: ${message}`, "error");
      log.error("[OfferingReportListPage] Failed to load offerings", { error: err });
    } finally {
      pageLoading.isLoading = false;
    }
  }

  /**
   * Raw WHERE Change Handler
   *
   * Called when user changes the raw SQL WHERE clause in superuser mode.
   * Only saves the rawWhere state - Datagrid handles the reload automatically.
   */
  function handleRawWhereChange(newRawWhere: string | null) {
    log.info(`[OfferingReportListPage] Raw WHERE changed:`, newRawWhere);
    rawWhere = newRawWhere;
    // Datagrid triggers handleQueryChange automatically, just like with filters
  }
</script>

<div class="page-container">
  <h1>Offerings Report</h1>
  <OfferingReportGrid
    rows={resolvedOfferings}
    onQueryChange={handleQueryChange}
    showSuperuserWhere={true}
    onRawWhereChange={handleRawWhereChange}
  />
</div>

<style>
  .page-container {
    padding: 2rem;
    height: 100%;
    background: var(--color-background);
    max-width: 80vw;
  }
</style>
