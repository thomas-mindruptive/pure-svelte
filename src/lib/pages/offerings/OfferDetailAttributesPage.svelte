<!-- src/lib/pages/offerings/OfferDetailAttributesPage.svelte - REFACTORED -->
<script lang="ts">
  import { log } from "$lib/utils/logger";
  import { addNotification } from "$lib/stores/notifications";
  import { invalidateAll } from "$app/navigation";
  import AttributeGrid from "$lib/components/domain/attributes/AttributeGrid.svelte";
  import {
    getOfferingApi,
    offeringLoadingState,
  } from "$lib/api/client/offering";
  import type {
    WholesalerOfferingAttribute_Attribute,
    Attribute,
    WholesalerItemOffering_ProductDef_Category,
    ProductDefinition,
  } from "$lib/domain/types";
  import type {
    DeleteStrategy,
    RowActionStrategy,
    ID,
  } from "$lib/components/client/Datagrid.types";

  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/grid-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/form-elements.css";
  import OfferingDetailWrapper from "$lib/components/domain/offerings/OfferingDetailWrapper.svelte";

  import { ApiClient } from "$lib/api/client/ApiClient";

  type LoadData = {
    offering?: WholesalerItemOffering_ProductDef_Category | null; // CREATE-mode: can be null
    assignedAttributes: WholesalerOfferingAttribute_Attribute[];
    availableAttributes: Attribute[];
    availableProducts?: ProductDefinition[] | null; // This is only needed for the "create" mode: We need the available products for the combobox.
  };
  let { data } = $props<{ data: LoadData }>();

  log.debug(`(OfferDetailAttributesPage) Loaded data:`, data);

  let selectedAttributeId: number | null = $state(null);
  let attributeValue: string = $state("");
  let isAssigning = $state(false);

  // ===== API client =====

  const client = new ApiClient(fetch);
  const offeringApi = getOfferingApi(client);

  // ===== API CALLS =====

  async function handleAttributeDelete(ids: ID[]): Promise<void> {
    log.info(`(OfferDetailAttributesPage) Deleting attribute assignments`, {
      ids,
    });
    let dataChanged = false;
    for (const id of ids) {
      const parsed = offeringApi.parseAttributeCompositeId(String(id));
      if (!parsed) continue;
      const { offeringId, attributeId } = parsed;
      const result = await offeringApi.deleteOfferingAttribute(
        offeringId,
        attributeId,
      );
      if (result.success) {
        addNotification(`Attribute assignment deleted.`, "success");
        dataChanged = true;
      } else {
        addNotification(`Could not delete attribute assignment.`, "error");
      }
    }
    if (dataChanged) invalidateAll();
  }

  function handleAttributeSelect(
    attribute: WholesalerOfferingAttribute_Attribute,
  ) {
    addNotification(
      `Editing for "${attribute.attribute_name}" not yet implemented.`,
      "info",
    );
  }

  async function handleAssignAttribute(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedAttributeId) {
      addNotification("Please select an attribute.", "error");
      return;
    }
    isAssigning = true;
    try {
      const assignmentData = {
        offering_id: data.offering.offering_id,
        attribute_id: selectedAttributeId,
        ...(attributeValue && { value: attributeValue }), // `value` wird nur hinzugefügt, wenn es einen Wert hat
      };

      await offeringApi.createOfferingAttribute(assignmentData);

      addNotification("Attribute assigned successfully.", "success");
      selectedAttributeId = null;
      attributeValue = "";
      await invalidateAll();
    } catch (error) {
      log.error(`(OfferDetailAttributesPage) Failed to assign attribute`, {
        error,
      });
      addNotification("Failed to assign attribute.", "error");
    } finally {
      isAssigning = false;
    }
  }

  // ===== Strategies to be passed to grid =====

  const deleteStrategy: DeleteStrategy<WholesalerOfferingAttribute_Attribute> =
    { execute: handleAttributeDelete };
  const rowActionStrategy: RowActionStrategy<WholesalerOfferingAttribute_Attribute> =
    { click: handleAttributeSelect };
</script>

{#if false}
  NOTE: The event handlers like "onSubmitted" are handled by the wrapper
  istself.
{/if}

<OfferingDetailWrapper
  offering={data.offering}
  availableProducts={data.availableProducts}
>
  <!-- Der spezifische Inhalt dieser Seite kommt in den Default Slot -->
  <div class="grid-section">
    <div class="assignment-section">
      <h3>Assign New Attribute</h3>
      <form class="assignment-form" onsubmit={handleAssignAttribute}>
        <select bind:value={selectedAttributeId} disabled={isAssigning}>
          <option value={null}>Select an attribute...</option>
          {#each data.availableAttributes as attr (attr.attribute_id)}
            <option value={attr.attribute_id}>{attr.name}</option>
          {/each}
        </select>
        <input
          type="text"
          placeholder="Value (e.g., 'Red')"
          bind:value={attributeValue}
          disabled={isAssigning}
        />
        <button
          type="submit"
          class="primary-button"
          disabled={isAssigning || !selectedAttributeId}
        >
          {isAssigning ? "Assigning..." : "Assign"}
        </button>
      </form>
    </div>

    <h2 style="margin-top: 1.5rem;">Assigned Attributes</h2>
    <AttributeGrid
      rows={data.assignedAttributes}
      loading={$offeringLoadingState}
      {deleteStrategy}
      {rowActionStrategy}
    />
  </div>
</OfferingDetailWrapper>
