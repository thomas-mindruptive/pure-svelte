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
   * - Filter/sort state persistence for combined queries
   *
   * Data Flow:
   * 1. Route loader (+page.ts) returns Promise<offerings> and fetch function
   * 2. $effect resolves initial Promise and populates grid
   * 3. User filters/sorts -> handleFilter/handleSort -> API call with combined where+sort
   * 4. New data replaces grid contents
   *
   * State Management:
   * - currentWhere: Active filter conditions (null = no filter)
   * - currentSort: Active sort descriptors (null = no sort)
   * - Both are combined when calling API (enables filter + sort simultaneously)
   */
  import { ApiClient } from "$lib/api/client/apiClient";
  import { getOfferingApi } from "$lib/api/client/offering";
  import OfferingReportGrid from "./OfferingReportGrid.svelte";
  import type {
    SortDescriptor,
    WhereCondition,
    WhereConditionGroup
  } from "$lib/backendQueries/queryGrammar";
  import type { OfferingReportViewWithLinks } from "$lib/domain/domainTypes";
  import { log } from "$lib/utils/logger";

  type Props = {
    data: {
      offerings: Promise<OfferingReportViewWithLinks[]>;
      loadEventFetch: typeof fetch;
    };
  };

  let { data }: Props = $props();
  let resolvedOfferings = $state<OfferingReportViewWithLinks[]>([]);
  let isLoading = $state(true);
  let currentWhere = $state<WhereCondition<any> | WhereConditionGroup<any> | null>(null);
  let currentSort = $state<SortDescriptor<any>[] | null>(null);

  const client = new ApiClient(data.loadEventFetch);
  const offeringApi = getOfferingApi(client);

  /**
   * Initial Load Effect
   *
   * Resolves the Promise returned by the route loader (+page.ts).
   * Uses abort pattern to prevent stale updates if component unmounts.
   *
   * Why $effect?
   * - Runs once on mount (no dependencies tracked)
   * - Cleanup function (return) aborts pending async operations
   * - Prevents "setState on unmounted component" errors
   */
  $effect(() => {
    let aborted = false;

    const processPromise = async () => {
      isLoading = true;
      try {
        if (!aborted) {
          resolvedOfferings = await data.offerings;
        }
      } finally {
        if (!aborted) {
          isLoading = false;
        }
      }
    };

    processPromise();
    return () => { aborted = true; };
  });

  /**
   * Filter Handler
   *
   * Called when user applies/changes filters in the grid.
   * Combines current sort with new filter conditions and fetches fresh data.
   *
   * Important: Always passes BOTH where and sort to API.
   * - This allows filtered + sorted results
   * - Null where = no filter (but sort still applies)
   */
  async function handleFilter(where: WhereConditionGroup<any> | WhereCondition<any> | null) {
    log.info(`[OfferingReportListPage] Filter triggered:`, where);
    currentWhere = where;
    isLoading = true;
    try {
      log.info(`[OfferingReportListPage] Calling API with where:`, where, `sort:`, currentSort);
      resolvedOfferings = await offeringApi.loadOfferingsForReportWithLinks(where, currentSort);
      log.info(`[OfferingReportListPage] Received ${resolvedOfferings.length} offerings`);
      log.debug(`[OfferingReportListPage] First 3 offerings:`, resolvedOfferings.slice(0, 3));
    } finally {
      isLoading = false;
    }
  }

  /**
   * Sort Handler
   *
   * Called when user clicks column headers to sort.
   * Combines current filter with new sort descriptors and fetches fresh data.
   *
   * Important: Always passes BOTH where and sort to API.
   * - This allows filtered + sorted results
   * - Null sort = no sorting (but filter still applies)
   */
  async function handleSort(sort: SortDescriptor<any>[] | null) {
    log.info(`[OfferingReportListPage] Sort triggered:`, sort);
    currentSort = sort;
    isLoading = true;
    try {
      log.info(`[OfferingReportListPage] Calling API with where:`, currentWhere, `sort:`, sort);
      resolvedOfferings = await offeringApi.loadOfferingsForReportWithLinks(currentWhere, sort);
      log.info(`[OfferingReportListPage] Received ${resolvedOfferings.length} offerings`);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="page-container">
  <h1>Offerings Report</h1>
  <OfferingReportGrid
    rows={resolvedOfferings}
    loading={isLoading}
    onFilter={handleFilter}
    onSort={handleSort}
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
