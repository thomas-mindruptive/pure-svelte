<script lang="ts">
  import AttributesGrid from "$lib/components/domain/attributes/AttributesGrid.svelte";
  import { getAttributeApi } from "$lib/api/client/attribute";
  import type { Attribute } from "$lib/domain/domainTypes";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { ApiClient } from "$lib/api/client/apiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type { SortDescriptor, WhereCondition, WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
  import { page } from "$app/state";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import "$lib/components/styles/list-page-layout.css";
  import { getContext } from "svelte";

  // === PROPS ====================================================================================

  let { data }: { data: { loadEventFetch: typeof fetch } } = $props();

  // === STATE ====================================================================================

  let resolvedAttributes = $state<Attribute[]>([]);
  let loadingOrValidationError = $state<{ message: string; status: number } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // Get page-local loading context from layout
  type PageLoadingContext = { isLoading: boolean };
  const pageLoading = getContext<PageLoadingContext>('page-loading');

  // === LOAD =====================================================================================
  // Initial load is now controlled by Datagrid component via onQueryChange
  // No $effect needed - prevents race conditions and duplicate loads

  // === API & EVENTS =============================================================================

  const client = new ApiClient(data.loadEventFetch);
  const attributeApi = getAttributeApi(client);

  function handleAttributeSelect(attribute: Attribute): void {
    log.info(`(AttributeListPage) Navigating to detail for attributeId: ${attribute.attribute_id}`);
    goto(`${page.url.pathname}/${attribute.attribute_id}`);
  }

  async function handleAttributeDelete(ids: ID[]): Promise<void> {
    log.info(`(AttributeListPage) Deleting attributes`, { ids });
    let dataChanged = false;
    const idsAsNumber = stringsToNumbers(ids);

    dataChanged = await cascadeDelete(
      idsAsNumber,
      attributeApi.deleteAttribute,
      {
        domainObjectName: "Attribute",
        softDepInfo: "This will remove the attribute from all offerings it is assigned to.",
        hardDepInfo: "", // Attributes have no hard dependencies
      },
      allowForceCascadingDelte,
    );

    if (dataChanged) {
      // Reload the list to reflect the changes
      resolvedAttributes = await attributeApi.loadAttributes();
    }
  }

  function handleAttributeCreate() {
    log.info(`Going to AttributeDetailPage with "new"`);
    // We assume a future route like `/attributes/new`.
    goto(`${page.url.pathname}/new`);
  }

  // Track if we've done the first load
  let firstLoadComplete = false;

  async function handleQueryChange(query: {
    filters: WhereCondition<Attribute> | WhereConditionGroup<Attribute> | null,
    sort: SortDescriptor<Attribute>[] | null
  }) {
    log.info(`(AttributesListPage) Query change - filters:`, query.filters, `sort:`, query.sort);

    // Only show loading for subsequent queries, not the first one
    if (firstLoadComplete) {
      pageLoading.isLoading = true;
    }
    loadingOrValidationError = null;

    try {
      // For now, loadAttributes doesn't support filters/sort, so we just load all
      // In the future, update to loadAttributesWithWhereAndOrder when available
      resolvedAttributes = await attributeApi.loadAttributes();
      log.info(`(AttributesListPage) Received ${resolvedAttributes.length} attributes`);

      // First load is done, clear the initial loading state
      if (!firstLoadComplete) {
        firstLoadComplete = true;
        log.info("(AttributesListPage) First load complete");
      }
    } catch (rawError: any) {
      // Robust error handling from the original $effect
      const status = rawError.status ?? 500;
      const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading attributes.";

      // Set the clean error state for the UI to display
      loadingOrValidationError = { message, status };

      // Log the full error for debugging
      log.error("(AttributesListPage) Error loading attributes", { rawError });
    } finally {
      pageLoading.isLoading = false;
    }
  }

  // === GRID STRATEGIES ==========================================================================

  const deleteStrategy: DeleteStrategy<Attribute> = {
    execute: handleAttributeDelete,
  };

  const rowActionStrategy: RowActionStrategy<Attribute> = {
    click: handleAttributeSelect,
  };
</script>

<!--- TEMPLATE ----------------------------------------------------------------------------------->

<div class="list-page-content-wrapper">
  <h1>Attributes</h1>
  <p>Manage the master list of attributes that can be assigned to product offerings.</p>

  {#if loadingOrValidationError}
    <div class="component-error-boundary">
      <h3>Error Loading Attributes (Status: {loadingOrValidationError.status})</h3>
      <p>{loadingOrValidationError.message}</p>
    </div>
  {:else}
    <div class="grid-section">
      <button
        class="pc-grid__createbtn"
        onclick={handleAttributeCreate}
      >
        Create Attribute
      </button>
      <AttributesGrid
        rows={resolvedAttributes}
        {deleteStrategy}
        {rowActionStrategy}
        onQueryChange={handleQueryChange}
      />
    </div>
  {/if}
</div>

<style>
</style>
