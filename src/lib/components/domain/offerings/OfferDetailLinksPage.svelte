<!-- src/lib/pages/offerings/OfferDetailLinksPage.svelte -->
<script lang="ts">
  import { addNotification } from "$lib/stores/notifications";
  import LinkGrid from "$lib/components/links/LinkGrid.svelte";
  import { getOfferingApi, offeringLoadingState } from "$lib/api/client/offering";
  import { type WholesalerOfferingLink } from "$lib/domain/domainTypes";
  import { ApiClient } from "$lib/api/client/ApiClient";
  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/grid-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/form-elements.css";
  import OfferingDetailWrapper from "$lib/components/domain/offerings/OfferingDetailWrapper.svelte";
  import type { ID, DeleteStrategy } from "$lib/components/grids/Datagrid.types";
  import {
    OfferingDetailLinks_LoadDataSchema,
    type OfferingDetailLinks_LoadData,
    type OfferingDetailLinks_LoadDataAsync,
  } from "./offeringDetail.types";
  import { log } from "$lib/utils/logger";
  import { assertDefined } from "$lib/utils/assertions";
  import { getErrorMessage } from "$lib/api/client/common";

  // === PROPS ====================================================================================

  let { data }: { data: OfferingDetailLinks_LoadDataAsync } = $props();

  // === STATE ====================================================================================

  let resolvedData = $state<OfferingDetailLinks_LoadData | null>(null);
  let isLoading = $state(true);
  let loadingError = $state<{ message: string; status?: number } | null>(null);

  // === LOAD =====================================================================================

  $effect(() => {
    let aborted = false;
    const processPromises = async () => {
      isLoading = true;
      loadingError = null;
      resolvedData = null;

      try {
        const [offering, availableProducts, availableSuppliers, materials, forms] = await Promise.all([
          data.offering,
          //⚠️NOTE: We load the links directly with the offering! => not needed: data.links,
          data.availableProducts,
          data.availableSuppliers,
          data.materials,
          data.forms,
        ]);
        log.debug(`All promises resolved: `, { offering, availableProducts, availableSuppliers });

        if (aborted) return;

        const dataToValidate: OfferingDetailLinks_LoadData = {
          ...data,
          offering,
          //⚠️NOTE: We load the links directly with the offering! => not needed:links,
          availableProducts,
          availableSuppliers,
          materials,
          forms,
        };

        if (offering && (offering as any).error) {
          addNotification(`Cannot load offering: ${getErrorMessage((offering as any).error)}`);
          throw (offering as any).error;
        }

        const validationResult = OfferingDetailLinks_LoadDataSchema.safeParse(dataToValidate);

        if (!validationResult.success) {
          log.error("(OfferDetailLinksPage) Zod validation failed", validationResult.error.issues);
          throw new Error(
            `OfferingDetailPageLinks: Received invalid data structure from the API: ${JSON.stringify(validationResult.error.issues)}`,
          );
        } else {
          log.debug("(OfferDetailLinksPage) Zod validation succeeded");
        }

        resolvedData = validationResult.data!;

        // if (resolvedData.isCreateMode) {
        //   resolvedData.offering = {} as WholesalerItemOffering_ProductDef_Category_Supplier;
        //   if (resolvedData.isSuppliersRoute) {
        //     assertDefined(resolvedData, "supplierId", ["supplierId"]);
        //     resolvedData.offering.wholesaler_id = resolvedData.supplierId!;
        //   } else if (resolvedData.isCategoriesRoute) {
        //     assertDefined(resolvedData, "categoryId", ["categoryId"]);
        //     resolvedData.offering.product_def_id = resolvedData.productDefId!;
        //   } else {
        //     throw error(400, "Route must be suppliers or categories.");
        //   }
        // }
      } catch (rawError: any) {
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load or validate link details.";
        loadingError = { message, status };
        log.error("(OfferDetailLinksPage) Promise processing failed", {
          rawError,
        });
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

  // --- STATE & API ---
  let newUrl = $state("");
  let newNotes = $state("");
  let isAssigning = $state(false);

  const client = new ApiClient(fetch);
  const offeringApi = getOfferingApi(client);

  // ===== HELPERS =====

  /**
   * Reload links and set them into state.
   */
  async function reloadLinks() {
    assertDefined(resolvedData, "reloadLinks: resolvedData.offering must be defined", ["offering"]);

    log.info("(OfferDetailLinksPage) Re-fetching links...");
    const updatedLinks = await offeringApi.loadOfferingLinks(resolvedData.offering.offering_id);
    resolvedData.offering.links = updatedLinks;
    log.info("(OfferDetailLinksPage) Local state updated with new links.");
  }

  // --- API-AUFRUFE ---

  async function handleLinkDelete(ids: ID[]): Promise<void> {
    assertDefined(ids, "OfferDetailLinksPage.handleLinkDelete");
    let dataChanged = false;

    for (const id of ids) {
      const result = await offeringApi.deleteOfferingLink(Number(id));

      if (result.success) {
        dataChanged = true;
      } else {
        // Zeige die Fehlermeldung vom Server an, falls vorhanden.
        addNotification(result.message ? `Server error: ${result.message}` : "Could not delete link.", "error");
      }
    }

    if (dataChanged) {
      addNotification("Link(s) deleted.", "success");
      await reloadLinks();
    }
  }

  // NOT needed. Link grid navigates to EXTERNAL link.
  // function handleLinkSelect(link: WholesalerOfferingLink) {
  //   assertDefined(link, "OfferDetailLinksPage.handleLinkSelect");
  //   addNotification(`Editing for link "${link.url}" not yet implemented.`, "info");
  // }

  async function handleAssignLink(event: SubmitEvent) {
    assertDefined(event, "OfferDetailLinksPage.handleAssignLink");
    event.preventDefault();

    if (!resolvedData || !resolvedData.offering) {
      addNotification("An offering must be saved before assigning links.", "error");
      return;
    }

    if (!newUrl) return;
    isAssigning = true;
    try {
      const linkData: Omit<WholesalerOfferingLink, "link_id"> = {
        offering_id: resolvedData.offering.offering_id,
        url: newUrl,
        ...(newNotes && { notes: newNotes }),
      };
      await offeringApi.createOfferingLink(linkData);

      addNotification("Link added.", "success");
      newUrl = "";
      newNotes = "";
      reloadLinks();
    } finally {
      isAssigning = false;
    }
  }

  // --- GRID STRATEGIES ---
  const deleteStrategy: DeleteStrategy<WholesalerOfferingLink> = {
    execute: handleLinkDelete,
  };
  // NOTE: Link grid navigates to external link => No strategy.
  // const rowActionStrategy: RowActionStrategy<WholesalerOfferingLink> = {
  //   click: handleLinkSelect,
  // };
</script>

{#if loadingError}
  <div class="component-error-boundary">
    <h3>Error Loading Data (Status: {loadingError.status})</h3>
    <p>{loadingError.message}</p>
  </div>
{:else if isLoading || !resolvedData}
  <div class="detail-page-layout">Loading link details...</div>
{:else}
  <OfferingDetailWrapper initialLoadedData={resolvedData}>
    <div class="grid-section">
      <div class="assignment-section">
        <h3>Add New Link</h3>
        {#if !resolvedData.offering}
          <p class="field-hint">You must save the new offering first before you can add links.</p>
        {/if}
        <form
          class="assignment-form"
          onsubmit={handleAssignLink}
        >
          <input
            type="url"
            placeholder="https://example.com/product"
            bind:value={newUrl}
            required
            disabled={isAssigning || !resolvedData.offering}
          />
          <input
            type="text"
            placeholder="Optional notes..."
            bind:value={newNotes}
            disabled={isAssigning || !resolvedData.offering}
          />
          <button
            type="submit"
            class="primary-button"
            disabled={isAssigning || !newUrl || !resolvedData.offering}
          >
            {isAssigning ? "Adding..." : "Add Link"}
          </button>
        </form>
      </div>

      <h2 style="margin-top: 1.5rem;">Assigned Links</h2>
      {#if !resolvedData.offering}
        <p class="field-hint">You must save the new offering first before you can add/see links.</p>
      {:else}
        <!-- We do NOT pass rowStrategy because the link grid navigates to EXTERNAL link. -->
        <LinkGrid
          rows={resolvedData.offering.links || []}
          loading={$offeringLoadingState}
          {deleteStrategy}
        />
      {/if}
    </div>
  </OfferingDetailWrapper>
{/if}
