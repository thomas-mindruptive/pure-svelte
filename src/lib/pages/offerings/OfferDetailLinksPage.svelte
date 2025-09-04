<!-- src/lib/pages/offerings/OfferDetailLinksPage.svelte -->
<script lang="ts">
  import { addNotification } from "$lib/stores/notifications";
  import { invalidateAll } from "$app/navigation";

  import LinkGrid from "$lib/components/links/LinkGrid.svelte";
  import {
    getOfferingApi,
    offeringLoadingState,
  } from "$lib/api/client/offering";
  import type { WholesalerOfferingLink } from "$lib/domain/domainTypes";

  import { ApiClient } from "$lib/api/client/ApiClient";

  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/grid-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/form-elements.css";
  import OfferingDetailWrapper from "$lib/components/domain/offerings/OfferingDetailWrapper.svelte";
  import type {
    ID,
    DeleteStrategy,
    RowActionStrategy,
  } from "$lib/components/grids/Datagrid.types";
  import {
    OfferingDetailLinks_LoadDataSchema,
    type OfferingDetailLinks_LoadData,
  } from "./offeringDetail.types";

  let { data: rawLoadedData } = $props<{
    data: OfferingDetailLinks_LoadData;
  }>();

  let { data, errors } = $derived.by(() => {
    const result = OfferingDetailLinks_LoadDataSchema.safeParse(rawLoadedData);
    return {
      data: result.success ? result.data : null,
      errors: result.success ? null : result.error.issues,
      isValid: result.success,
    };
  });

  let newUrl = $state("");
  let newNotes = $state("");
  let isAssigning = $state(false);

  // 1. Create an ApiClient instance with the client `fetch`.
  const client = new ApiClient(fetch);

  // 2. Get the supplier-specific API methods from the factory.
  const offeringApi = getOfferingApi(client);

  async function handleLinkDelete(ids: ID[]): Promise<void> {
    for (const id of ids) {
      await offeringApi.deleteOfferingLink(Number(id));
    }
    addNotification("Link(s) deleted.", "success");
    invalidateAll();
  }

  function handleLinkSelect(link: WholesalerOfferingLink) {
    addNotification(
      `Editing for link "${link.url}" not yet implemented.`,
      "info",
    );
  }

  async function handleAssignLink(event: SubmitEvent) {
    // Das Standardverhalten wird hier programmatisch verhindert.
    event.preventDefault();

    if (!data) {
      addNotification(
        "No valid data available. Probably validation failed",
        "error",
      );
      return;
    }
    if (!data.offering) {
      addNotification(
        "No offering available. Probably CREATE mode => Cannot assign link.",
        "error",
      );
      return;
    }

    if (!newUrl) return;
    isAssigning = true;
    try {
      const linkData: Omit<WholesalerOfferingLink, "link_id"> = {
        offering_id: data.offering.offering_id,
        url: newUrl,
        ...(newNotes && { notes: newNotes }),
      };
      await offeringApi.createOfferingLink(linkData);

      addNotification("Link added.", "success");
      newUrl = "";
      newNotes = "";
      await invalidateAll();
    } finally {
      isAssigning = false;
    }
  }

  const deleteStrategy: DeleteStrategy<WholesalerOfferingLink> = {
    execute: handleLinkDelete,
  };

  const rowActionStrategy: RowActionStrategy<WholesalerOfferingLink> = {
    click: handleLinkSelect,
  };
</script>

{#if data}
  <OfferingDetailWrapper
    initialLoadedData={data}
    availableProducts={data.availableProducts}
  >
    <!-- Der spezifische Inhalt dieser Seite kommt in den Default Slot -->
    <div class="grid-section">
      <div class="assignment-section">
        <h3>Add New Link</h3>
        <form class="assignment-form" onsubmit={handleAssignLink}>
          <input
            type="url"
            placeholder="https://example.com/product"
            bind:value={newUrl}
            required
            disabled={isAssigning}
          />
          <input
            type="text"
            placeholder="Optional notes..."
            bind:value={newNotes}
            disabled={isAssigning}
          />
          <button
            type="submit"
            class="primary-button"
            disabled={isAssigning || !newUrl}
          >
            {isAssigning ? "Adding..." : "Add Link"}
          </button>
        </form>
      </div>

      <h2 style="margin-top: 1.5rem;">Assigned Links</h2>
      <LinkGrid
        rows={data.links}
        loading={$offeringLoadingState}
        {deleteStrategy}
        {rowActionStrategy}
      />
    </div>
  </OfferingDetailWrapper>
{:else if errors}
  <div class="component-error-boundary">
    <h3>Error</h3>
    {#each errors as error}
      <p>{error.path.join(".")}: {error.message}</p>
    {/each}
  </div>
{/if}
