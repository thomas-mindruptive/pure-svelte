<script lang="ts">
  import AttributesGrid from "$lib/components/domain/attributes/AttributesGrid.svelte";
  import { attributeLoadingState, getAttributeApi } from "$lib/api/client/attribute";
  import type { Attribute } from "$lib/domain/domainTypes";
  import { goto } from "$app/navigation";
  import { log } from "$lib/utils/logger";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import type { ID, DeleteStrategy, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import { page } from "$app/stores";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { stringsToNumbers } from "$lib/utils/typeConversions";
  import "$lib/components/styles/list-page-layout.css";

  // === PROPS ====================================================================================

  let { data }: { data: { attributes: Promise<Attribute[]> } } = $props();

  // === STATE ====================================================================================

  let resolvedAttributes = $state<Attribute[]>([]);
  let isLoading = $state(true);
  let loadingOrValidationError = $state<{ message: string; status: number } | null>(null);
  const allowForceCascadingDelte = $state(true);

  // === LOAD =====================================================================================

  $effect(() => {
    let aborted = false;
    const processPromise = async () => {
      isLoading = true;
      loadingOrValidationError = null;
      resolvedAttributes = [];

      try {
        if (!aborted) {
          resolvedAttributes = await data.attributes;
          log.debug(`Attributes promise resolved successfully.`);
        }
      } catch (rawError: any) {
        if (!aborted) {
          const status = rawError.status ?? 500;
          const message = rawError.body?.message || rawError.message || "An unknown error occurred while loading attributes.";
          loadingOrValidationError = { message, status };
          log.error("(AttributeListPage) Promise rejected while loading attributes", { rawError });
        }
      } finally {
        if (!aborted) {
          isLoading = false;
        }
      }
    };

    processPromise();

    return () => {
      aborted = true;
    };
  });

  // === API & EVENTS =============================================================================

  const client = new ApiClient(fetch);
  const attributeApi = getAttributeApi(client);

  function handleAttributeSelect(attribute: Attribute): void {
    log.info(`(AttributeListPage) Navigating to detail for attributeId: ${attribute.attribute_id}`);
    // NOTE: The detail page for attributes is not yet defined in the provided files.
    // We assume a future route like `/attributes/[id]`.
    goto(`/attributes/${attribute.attribute_id}`);
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
    goto(`${$page.url.pathname}/new`);
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
        loading={isLoading || $attributeLoadingState}
        {deleteStrategy}
        {rowActionStrategy}
      />
    </div>
  {/if}
</div>

<style>
</style>
