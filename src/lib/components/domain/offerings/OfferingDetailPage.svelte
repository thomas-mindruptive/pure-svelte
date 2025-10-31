<!-- src/lib/components/domain/offerings/OfferingDetailPage.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { addNotification } from "$lib/stores/notifications";
  import { log } from "$lib/utils/logger";
  import { assertDefined } from "$lib/utils/assertions";
  import { error } from "@sveltejs/kit";

  // Component Imports
  import OfferingForm from "./OfferingForm.svelte";
  import AttributeGrid from "$lib/components/domain/attributes/WholesalerOfferingAttributeGrid.svelte";
  import LinkGrid from "$lib/components/links/LinkGrid.svelte";
  import OfferingGrid from "$lib/components/domain/offerings/OfferingGrid.svelte";
  import "$lib/components/styles/assignment-section.css";
  import "$lib/components/styles/detail-page-layout.css";
  import "$lib/components/styles/grid-section.css";
  import "$lib/components/styles/form-elements.css";

  // API & Type Imports
  import { ApiClient } from "$lib/api/client/ApiClient";
  import { getOfferingApi, offeringLoadingState } from "$lib/api/client/offering";
  import type { DeleteStrategy, ID, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type {
    Attribute,
    WholesalerItemOffering,
    WholesalerOfferingAttribute_Attribute,
    WholesalerOfferingLink,
    Wio_PDef_Cat_Supp_WithLinks,
    Wio_PDef_Cat_Supp_Nested_WithLinks,
  } from "$lib/domain/domainTypes";
  import { getErrorMessage } from "$lib/api/client/common";

  // === TYPES ====================================================================================

  export type OfferingChildRelationships = "attributes" | "links" | "source-offerings";

  // === PROPS ====================================================================================

  export interface OfferingDetailPageProps {
    offeringId: number;
    isCreateMode: boolean;
    activeChildPath: OfferingChildRelationships;
    isSuppliersRoute: boolean;
    isCategoriesRoute: boolean;
    supplierId?: number | undefined;
    categoryId: number;
    productDefId?: number | undefined;
    loadEventFetch: typeof fetch;
    params: Record<string, number | string>;
    urlPathName: string;
  }

  let { data }: { data: OfferingDetailPageProps } = $props();

  // === STATE ====================================================================================

  let offering = $state<Wio_PDef_Cat_Supp_WithLinks | null>(null);
  let attributes = $state<WholesalerOfferingAttribute_Attribute[]>([]);
  let availableAttributes = $state<Attribute[]>([]);
  let links = $state<WholesalerOfferingLink[]>([]);
  let sourceOfferings = $state<Wio_PDef_Cat_Supp_Nested_WithLinks[]>([]);

  // Dummy strategies for source offerings - no delete for now
  const sourceOfferingsDeleteStrategy: DeleteStrategy<Wio_PDef_Cat_Supp_Nested_WithLinks> = {
    execute: async (ids: ID[]) => {
      addNotification("Delete source offerings not implemented yet", "info");
    }
  };

  let isLoading = $state(true);

  // === API =====================================================================================

  if (!data.loadEventFetch) {
    throw error(500, `OfferingDetailPage: data.loadEventFetch must be defined.`);
  }
  const client = new ApiClient(data.loadEventFetch);
  const offeringApi = getOfferingApi(client);

  // === LOAD =====================================================================================

  $effect(() => {
    let aborted = false;
    log.debug(`OfferingDetailPage data props:`, data);

    const processPromises = async () => {
      isLoading = true;

      try {
        // Load offering (always needed)
        offering = await offeringApi.loadOffering(data.offeringId);
        if (aborted) return;

        // Load data based on activeChildPath
        if ("attributes" === data.activeChildPath) {
          attributes = await offeringApi.loadOfferingAttributes(data.offeringId);
          if (aborted) return;
          availableAttributes = await offeringApi.getAvailableAttributesForOffering(data.offeringId);
          if (aborted) return;
        } else if ("links" === data.activeChildPath) {
          links = offering.links || [];
        } else if ("source-offerings" === data.activeChildPath) {
          // Only load source offerings if this is a shop offering (wholesaler_id = 99)
          if (offering.wholesaler_id === 99) {
            sourceOfferings = await offeringApi.loadSourceOfferingsForShopOffering(data.offeringId);
            if (aborted) return;
          }
        } else {
          const msg = `Invalid data.activeChildPath: ${data.activeChildPath}`;
          log.error(msg);
        }
      } catch (rawError: any) {
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load offering details.";
        log.error("Promise processing failed", { rawError });
        throw error(status, message);
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

  // === FORM HANDLERS ===========================================================================

  async function handleFormSubmitted(p: { data: WholesalerItemOffering; result: unknown }): Promise<void> {
    assertDefined(p, "handleFormSubmitted");
    log.info(`Form submitted successfully`, p);
    addNotification("Offering updated successfully.", "success");

    if (data.isCreateMode && p.data.offering_id) {
      // Redirect to edit mode after create
      const newUrl = `${data.urlPathName}`.replace("/new", `/${p.data.offering_id}`);
      await goto(newUrl, { invalidateAll: true });
    } else {
      // Reload offering after update
      offering = await offeringApi.loadOffering(data.offeringId);
    }
  }

  async function handleSubmitError(info: { data: WholesalerItemOffering; error: unknown }): Promise<void> {
    log.error(`Form submission error`, info);
    addNotification(`Form submission error. ${getErrorMessage(info.error)}`, "error");
  }

  async function handleFormCancelled(p: { data: WholesalerItemOffering; reason?: string }): Promise<void> {
    log.info(`Form submission cancelled`, p);
    addNotification("Form submission cancelled.", "info");
  }

  async function handleFormChanged(info: { data: WholesalerItemOffering; dirty: boolean }): Promise<void> {
    log.debug(`Form changed`, info);
  }

  // === ATTRIBUTES SECTION =======================================================================

  let newAttributeId = $state<number | null>(null);
  let newAttributeValue = $state("");
  let isAssigningAttribute = $state(false);

  async function reloadAttributes() {
    assertDefined(offering, "reloadAttributes: offering must be defined");
    attributes = await offeringApi.loadOfferingAttributes(offering.offering_id);
    availableAttributes = await offeringApi.getAvailableAttributesForOffering(offering.offering_id);
  }

  async function handleAttributeAssign(event: SubmitEvent) {
    event.preventDefault();
    if (!offering || !newAttributeId) return;

    isAssigningAttribute = true;
    try {
      await offeringApi.createOfferingAttribute({
        offering_id: offering.offering_id,
        attribute_id: newAttributeId,
        value: newAttributeValue || null,
      });

      addNotification("Attribute assigned.", "success");
      newAttributeId = null;
      newAttributeValue = "";
      await reloadAttributes();
    } catch (err) {
      log.error("Failed to assign attribute", err);
      addNotification(`Failed to assign attribute: ${getErrorMessage(err)}`, "error");
    } finally {
      isAssigningAttribute = false;
    }
  }

  async function handleAttributeDelete(ids: ID[]): Promise<void> {
    if (!offering) return;
    let dataChanged = false;

    for (const id of ids) {
      const attr = attributes.find((a) => a.attribute_id === Number(id));
      if (!attr) continue;

      const result = await offeringApi.deleteOfferingAttribute(offering.offering_id, attr.attribute_id);
      if (result.success) {
        dataChanged = true;
      } else {
        addNotification(result.message ? `Server error: ${result.message}` : "Could not delete attribute.", "error");
      }
    }

    if (dataChanged) {
      addNotification("Attribute(s) deleted.", "success");
      await reloadAttributes();
    }
  }

  const attributesDeleteStrategy: DeleteStrategy<WholesalerOfferingAttribute_Attribute> = {
    execute: handleAttributeDelete,
  };

  // === LINKS SECTION ============================================================================

  let newUrl = $state("");
  let newNotes = $state("");
  let isAssigningLink = $state(false);

  async function reloadLinks() {
    assertDefined(offering, "reloadLinks: offering must be defined");
    links = await offeringApi.loadOfferingLinks(offering.offering_id);
    offering.links = links;
  }

  async function handleLinkAssign(event: SubmitEvent) {
    event.preventDefault();
    if (!offering || !newUrl) return;

    isAssigningLink = true;
    try {
      await offeringApi.createOfferingLink({
        offering_id: offering.offering_id,
        url: newUrl,
        ...(newNotes && { notes: newNotes }),
      });

      addNotification("Link added.", "success");
      newUrl = "";
      newNotes = "";
      await reloadLinks();
    } catch (err) {
      log.error("Failed to add link", err);
      addNotification(`Failed to add link: ${getErrorMessage(err)}`, "error");
    } finally {
      isAssigningLink = false;
    }
  }

  async function handleLinkDelete(ids: ID[]): Promise<void> {
    let dataChanged = false;

    for (const id of ids) {
      const result = await offeringApi.deleteOfferingLink(Number(id));
      if (result.success) {
        dataChanged = true;
      } else {
        addNotification(result.message ? `Server error: ${result.message}` : "Could not delete link.", "error");
      }
    }

    if (dataChanged) {
      addNotification("Link(s) deleted.", "success");
      await reloadLinks();
    }
  }

  const linksDeleteStrategy: DeleteStrategy<WholesalerOfferingLink> = {
    execute: handleLinkDelete,
  };

  // === SOURCE OFFERINGS SECTION =================================================================

  // TODO: Implement reloadSourceOfferings function and connect to "Copy for Shop" button
  // async function reloadSourceOfferings() {
  //   assertDefined(offering, "reloadSourceOfferings: offering must be defined");
  //   sourceOfferings = await offeringApi.loadSourceOfferingsForShopOffering(offering.offering_id);
  // }

  function handleOfferingSelect(selectedOffering: Wio_PDef_Cat_Supp_Nested_WithLinks) {
    // Navigate to offering detail page
    if (data.isSuppliersRoute) {
      goto(`/suppliers/${selectedOffering.wholesaler.wholesaler_id}/categories/${selectedOffering.category.category_id}/offerings/${selectedOffering.offering_id}`);
    } else {
      goto(`/categories/${selectedOffering.category.category_id}/productdefinitions/${selectedOffering.product_def.product_def_id}/offerings/${selectedOffering.offering_id}`);
    }
  }

  const offeringsRowActionStrategy: RowActionStrategy<Wio_PDef_Cat_Supp_Nested_WithLinks> = {
    click: handleOfferingSelect,
  };
</script>

<!------------------------------------------------------------------------------------------------
  SNIPPETS
  ------------------------------------------------------------------------------------------------>

<!-- ATTRIBUTES SECTION -------------------------------------------------------------------------->
{#snippet attributesSection()}
  <div class="grid-section">
    <div class="assignment-section">
      <h3>Assign Attribute</h3>
      {#if !offering}
        <p class="field-hint">You must save the new offering first before you can assign attributes.</p>
      {/if}
      <form class="assignment-form" onsubmit={handleAttributeAssign}>
        <select bind:value={newAttributeId} required disabled={isAssigningAttribute || !offering}>
          <option value={null}>Select attribute...</option>
          {#each availableAttributes as attr}
            <option value={attr.attribute_id}>{attr.name}</option>
          {/each}
        </select>
        <input
          type="text"
          placeholder="Optional value..."
          bind:value={newAttributeValue}
          disabled={isAssigningAttribute || !offering}
        />
        <button
          type="submit"
          class="primary-button"
          disabled={isAssigningAttribute || !newAttributeId || !offering}
        >
          {isAssigningAttribute ? "Assigning..." : "Assign Attribute"}
        </button>
      </form>
    </div>

    <h2 style="margin-top: 1.5rem;">Assigned Attributes</h2>
    {#if !offering}
      <p class="field-hint">You must save the new offering first before you can see attributes.</p>
    {:else}
      <AttributeGrid
        rows={attributes}
        loading={$offeringLoadingState}
        deleteStrategy={attributesDeleteStrategy}
      />
    {/if}
  </div>
{/snippet}

<!-- LINKS SECTION ------------------------------------------------------------------------------>
{#snippet linksSection()}
  <div class="grid-section">
    <div class="assignment-section">
      <h3>Add New Link</h3>
      {#if !offering}
        <p class="field-hint">You must save the new offering first before you can add links.</p>
      {/if}
      <form class="assignment-form" onsubmit={handleLinkAssign}>
        <input
          type="url"
          placeholder="https://example.com/product"
          bind:value={newUrl}
          required
          disabled={isAssigningLink || !offering}
        />
        <input
          type="text"
          placeholder="Optional notes..."
          bind:value={newNotes}
          disabled={isAssigningLink || !offering}
        />
        <button type="submit" class="primary-button" disabled={isAssigningLink || !newUrl || !offering}>
          {isAssigningLink ? "Adding..." : "Add Link"}
        </button>
      </form>
    </div>

    <h2 style="margin-top: 1.5rem;">Assigned Links</h2>
    {#if !offering}
      <p class="field-hint">You must save the new offering first before you can see links.</p>
    {:else}
      <LinkGrid rows={links} loading={$offeringLoadingState} deleteStrategy={linksDeleteStrategy} />
    {/if}
  </div>
{/snippet}

<!-- SOURCE OFFERINGS SECTION ------------------------------------------------------------------->
{#snippet sourceOfferingsSection()}
  <div class="grid-section">
    {#if !offering}
      <p class="field-hint">You must save the offering first before you can see source offerings.</p>
    {:else if offering.wholesaler_id !== 99}
      <p class="info-message">
        This is not a shop offering. Source offerings are only available for shop offerings (wholesaler_id = 99).
      </p>
    {:else}
      <h2>Source Offerings</h2>
      <p>These are the source offerings linked to this shop offering, ordered by priority.</p>

      <OfferingGrid
        rows={sourceOfferings}
        loading={$offeringLoadingState}
        deleteStrategy={sourceOfferingsDeleteStrategy}
        rowActionStrategy={offeringsRowActionStrategy}
      />
    {/if}
  </div>
{/snippet}

<!------------------------------------------------------------------------------------------------
  TEMPLATE
  ------------------------------------------------------------------------------------------------>
{#if isLoading}
  <div class="detail-page-layout">Loading offering details...</div>
{:else}
  <div class="detail-page-layout">
    <!-- Section 1: Offering details form -->
    <div class="form-section">
      <OfferingForm
        initialLoadedData={{
          offering,
          availableProducts: [],
          availableSuppliers: [],
          materials: [],
          forms: [],
          constructionTypes: [],
          surfaceFinishes: [],
          supplierId: data.supplierId,
          categoryId: data.categoryId,
          productDefId: data.productDefId,
          isSuppliersRoute: data.isSuppliersRoute,
          isCategoriesRoute: data.isCategoriesRoute,
          isCreateMode: data.isCreateMode,
          urlPathName: data.urlPathName,
        }}
        onSubmitted={handleFormSubmitted}
        onSubmitError={handleSubmitError}
        onCancelled={handleFormCancelled}
        onChanged={handleFormChanged}
      />
    </div>

    <!-- Section 2: Conditional grid based on activeChildPath -->
    {#if "attributes" === data.activeChildPath}
      {@render attributesSection()}
    {:else if "links" === data.activeChildPath}
      {@render linksSection()}
    {:else if "source-offerings" === data.activeChildPath}
      {@render sourceOfferingsSection()}
    {:else}
      <div class="component-error-boundary">Invalid child path: {data.activeChildPath}</div>
    {/if}
  </div>
{/if}

<style>
  .form-section {
    background: var(--color-background);
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }
  .grid-section {
    padding: 1.5rem;
  }
  h2 {
    margin-top: 0;
  }
  h3 {
    margin-top: 0;
    margin-bottom: 1rem;
  }
  p {
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--color-muted);
  }
  .field-hint {
    font-style: italic;
    color: var(--color-muted);
  }
  .info-message {
    padding: 1rem;
    background: var(--color-info-bg, #e3f2fd);
    border: 1px solid var(--color-info-border, #2196f3);
    border-radius: 4px;
    color: var(--color-info-text, #1565c0);
  }
</style>
