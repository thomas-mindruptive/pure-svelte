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
  import { getCategoryApi } from "$lib/api/client/category";
  import { getMaterialApi } from "$lib/api/client/material";
  import { getFormApi } from "$lib/api/client/form";
  import { getConstructionTypeApi } from "$lib/api/client/constructionType";
  import { getSurfaceFinishApi } from "$lib/api/client/surfaceFinish";
  import type { DeleteStrategy, ID, RowActionStrategy } from "$lib/components/grids/Datagrid.types";
  import type {
    Attribute,
    WholesalerItemOffering,
    WholesalerOfferingAttribute_Attribute,
    WholesalerOfferingLink,
    Wio_PDef_Cat_Supp_WithLinks,
    Wio_PDef_Cat_Supp_Nested_WithLinks,
    ProductDefinition,
    Wholesaler,
    Material,
    Form,
    ConstructionType,
    SurfaceFinish,
  } from "$lib/domain/domainTypes";
  import {
    Wio_PDef_Cat_Supp_WithLinks_Schema,
    Wio_PDef_Cat_Supp_Nested_WithLinks_Schema,
    ProductDefinitionSchema,
    WholesalerSchema,
    MaterialSchema,
    FormSchema,
    ConstructionTypeSchema,
    SurfaceFinishSchema,
    AttributeSchema,
    WholesalerOfferingLinkSchema,
  } from "$lib/domain/domainTypes";
  import { getErrorMessage } from "$lib/api/client/common";
  import type { ValidationErrorTree } from "$lib/components/validation/validation.types";
  import ValidationWrapper from "$lib/components/validation/ValidationWrapper.svelte";
  import { safeParseFirstN, zodToValidationErrorTree } from "$lib/domain/domainTypes.utils";
  import { cascadeDelete } from "$lib/api/client/cascadeDelete";
  import { stringsToNumbers } from "$lib/utils/typeConversions";

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

  let isLoading = $state(true);
  const errors = $state<Record<string, ValidationErrorTree>>({});

  let offering = $state<Wio_PDef_Cat_Supp_WithLinks | null>(null);
  let attributes = $state<WholesalerOfferingAttribute_Attribute[]>([]);
  let availableAttributes = $state<Attribute[]>([]);
  let links = $state<WholesalerOfferingLink[]>([]);
  let sourceOfferings = $state<Wio_PDef_Cat_Supp_Nested_WithLinks[]>([]);
  let copiedShopOfferingId = $state<number | null>(null);

  // Form combobox data
  let availableProducts = $state<ProductDefinition[]>([]);
  let availableSuppliers = $state<Wholesaler[]>([]);
  let materials = $state<Material[]>([]);
  let forms = $state<Form[]>([]);
  let constructionTypes = $state<ConstructionType[]>([]);
  let surfaceFinishes = $state<SurfaceFinish[]>([]);

  // === API =====================================================================================

  if (!data.loadEventFetch) {
    throw error(500, `OfferingDetailPage: data.loadEventFetch must be defined.`);
  }
  const client = new ApiClient(data.loadEventFetch);
  const offeringApi = getOfferingApi(client);
  const categoryApi = getCategoryApi(client);
  const materialApi = getMaterialApi(client);
  const formApi = getFormApi(client);
  const constructionTypeApi = getConstructionTypeApi(client);
  const surfaceFinishApi = getSurfaceFinishApi(client);

  // === LOAD =====================================================================================

  $effect(() => {
    let aborted = false;
    log.debug(`OfferingDetailPage data props:`, data);

    const processPromises = async () => {
      isLoading = true;

      try {
        // Load offering (not in create mode)
        if (!data.isCreateMode) {
          if (isNaN(data.offeringId) || data.offeringId < 0) {
            throw error(400, "OfferingDetailPage::$effect: Invalid Offering ID. Must be a positive number.");
          }

          offering = await offeringApi.loadOffering(data.offeringId);
          if (aborted) return;
          const offeringVal = Wio_PDef_Cat_Supp_WithLinks_Schema.nullable().safeParse(offering);
          if (!offeringVal.success) {
            errors.offering = zodToValidationErrorTree(offeringVal.error);
          }
        }

        // Load form combobox data (always needed)
        materials = await materialApi.loadMaterials();
        if (aborted) return;
        const materialsVal = safeParseFirstN(MaterialSchema, materials, 3);
        if (!materialsVal.success) {
          errors.materials = zodToValidationErrorTree(materialsVal.error);
        }

        forms = await formApi.loadForms();
        if (aborted) return;
        const formsVal = safeParseFirstN(FormSchema, forms, 3);
        if (!formsVal.success) {
          errors.forms = zodToValidationErrorTree(formsVal.error);
        }

        constructionTypes = await constructionTypeApi.loadConstructionTypes();
        if (aborted) return;
        const constructionTypesVal = safeParseFirstN(ConstructionTypeSchema, constructionTypes, 3);
        if (!constructionTypesVal.success) {
          errors.constructionTypes = zodToValidationErrorTree(constructionTypesVal.error);
        }

        surfaceFinishes = await surfaceFinishApi.loadSurfaceFinishes();
        if (aborted) return;
        const surfaceFinishesVal = safeParseFirstN(SurfaceFinishSchema, surfaceFinishes, 3);
        if (!surfaceFinishesVal.success) {
          errors.surfaceFinishes = zodToValidationErrorTree(surfaceFinishesVal.error);
        }

        // Load route-specific combobox data
        if (data.isSuppliersRoute) {
          // Load products for category (supplier is fixed)
          availableProducts = await categoryApi.loadProductDefsForCategory(data.categoryId);
          if (aborted) return;
          const productsVal = safeParseFirstN(ProductDefinitionSchema, availableProducts, 3);
          if (!productsVal.success) {
            errors.availableProducts = zodToValidationErrorTree(productsVal.error);
          }
        } else if (data.isCategoriesRoute) {
          // Load suppliers for category (product is fixed)
          availableSuppliers = await categoryApi.loadSuppliersForCategory(data.categoryId);
          if (aborted) return;
          const suppliersVal = safeParseFirstN(WholesalerSchema, availableSuppliers, 3);
          if (!suppliersVal.success) {
            errors.availableSuppliers = zodToValidationErrorTree(suppliersVal.error);
          }
        }

        // Load data based on activeChildPath (only in edit mode)
        if (!data.isCreateMode) {
          if ("attributes" === data.activeChildPath) {
            attributes = await offeringApi.loadOfferingAttributes(data.offeringId);
            if (aborted) return;
            // Note: attributes are WholesalerOfferingAttribute_Attribute, no schema for now

            availableAttributes = await offeringApi.getAvailableAttributesForOffering(data.offeringId);
            if (aborted) return;
            const availableAttrsVal = safeParseFirstN(AttributeSchema, availableAttributes, 3);
            if (!availableAttrsVal.success) {
              errors.availableAttributes = zodToValidationErrorTree(availableAttrsVal.error);
            }
          } else if ("links" === data.activeChildPath) {
            links = offering?.links || [];
            const linksVal = safeParseFirstN(WholesalerOfferingLinkSchema, links, 3);
            if (!linksVal.success) {
              errors.links = zodToValidationErrorTree(linksVal.error);
            }
          } else if ("source-offerings" === data.activeChildPath) {
            // Only load source offerings if this is a shop offering (wholesaler_id = 99)
            if (offering?.wholesaler_id === 99) {
              sourceOfferings = await offeringApi.loadSourceOfferingsForShopOffering(data.offeringId);
              if (aborted) return;
              const sourceOfferingsVal = safeParseFirstN(Wio_PDef_Cat_Supp_Nested_WithLinks_Schema, sourceOfferings, 3);
              if (!sourceOfferingsVal.success) {
                errors.sourceOfferings = zodToValidationErrorTree(sourceOfferingsVal.error);
              }
            }
          } else {
            const msg = `Invalid data.activeChildPath: ${data.activeChildPath}`;
            log.error(msg);
          }
        }
      } catch (rawError: any) {
        if (aborted) return;
        const status = rawError.status ?? 500;
        const message = rawError.message || "Failed to load offering details.";

        // Store error in errors state, don't throw
        if (rawError.errors) {
          errors.unexpectedError = { message, status, validationErrors: rawError.errors };
          log.error("Promise processing failed with validation errors", { rawError, validationErrors: rawError.errors });
        } else {
          errors.unexpectedError = { message, status };
          log.error("Promise processing failed in OfferingDetailPage", { rawError });
        }
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

  // === COPY FOR SHOP SECTION ====================================================================

  async function handleCopyForShop() {
    if (!offering || offering.wholesaler_id === 99) return;

    try {
      const shopOfferingId = await offeringApi.copyOfferingForShop(offering.offering_id);
      copiedShopOfferingId = shopOfferingId;
      addNotification(`Shop offering created successfully (ID: ${shopOfferingId})`, "success");
    } catch (rawError: any) {
      const message = rawError.message || "Failed to copy offering for shop.";
      const status = rawError.status ?? 500;
      errors.copyForShop = { message, status };
      addNotification(`Failed to copy for shop: ${getErrorMessage(rawError)}`, "error");
      log.error("Copy for shop failed", { rawError });
    }
  }

  function navigateToShopOffering() {
    if (!copiedShopOfferingId || !offering) return;

    let targetUrl: string;

    if (data.isSuppliersRoute) {
      targetUrl = `/suppliers/99/categories/${offering.category_id}/offerings/${copiedShopOfferingId}/source-offerings`;
    } else {
      targetUrl = `/categories/${offering.category_id}/productdefinitions/${offering.product_def_id}/offerings/${copiedShopOfferingId}/source-offerings`;
    }

    goto(targetUrl);
    copiedShopOfferingId = null;
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

  async function reloadSourceOfferings() {
    assertDefined(offering, "reloadSourceOfferings: offering must be defined");
    sourceOfferings = await offeringApi.loadSourceOfferingsForShopOffering(offering.offering_id);
  }

  async function handleSourceOfferingUnlink(ids: ID[]): Promise<void> {
    if (!offering) {
      log.warn("handleSourceOfferingUnlink: offering is undefined");
      return;
    }

    log.info("handleSourceOfferingUnlink: Starting unlink operation", {
      shopOfferingId: offering.offering_id,
      sourceOfferingIds: ids,
      count: ids.length,
    });

    let dataChanged = false;

    for (const id of ids) {
      const sourceOfferingId = Number(id);
      log.debug("handleSourceOfferingUnlink: Processing unlink", {
        shopOfferingId: offering.offering_id,
        sourceOfferingId,
      });

      try {
        const result = await offeringApi.removeSourceOfferingLink(offering.offering_id, sourceOfferingId);

        log.info("handleSourceOfferingUnlink: Received result", {
          shopOfferingId: offering.offering_id,
          sourceOfferingId,
          result,
          success: result.success,
        });

        if (result.success) {
          dataChanged = true;
          log.info("handleSourceOfferingUnlink: Successfully unlinked", {
            shopOfferingId: offering.offering_id,
            sourceOfferingId,
          });
        } else {
          const errorMessage = result.message ? `Server error: ${result.message}` : "Could not unlink source offering.";
          log.error("handleSourceOfferingUnlink: Unlink failed (success=false)", {
            shopOfferingId: offering.offering_id,
            sourceOfferingId,
            result,
            errorMessage,
          });
          addNotification(errorMessage, "error");
        }
      } catch (err) {
        log.error("handleSourceOfferingUnlink: Exception during unlink", {
          shopOfferingId: offering.offering_id,
          sourceOfferingId,
          error: err,
          errorMessage: getErrorMessage(err),
        });
        addNotification(`Error unlinking source offering: ${getErrorMessage(err)}`, "error");
      }
    }

    if (dataChanged) {
      log.info("handleSourceOfferingUnlink: Reloading source offerings after successful unlink");
      addNotification("Source offering(s) unlinked.", "success");
      await reloadSourceOfferings();
    } else {
      log.warn("handleSourceOfferingUnlink: No changes made");
    }
  }

  async function handleSourceOfferingDelete(ids: ID[]): Promise<void> {
    const idsAsNumber = stringsToNumbers(ids);

    const dataChanged = await cascadeDelete(
      idsAsNumber,
      offeringApi.deleteOffering,
      {
        domainObjectName: "Source Offering",
        softDepInfo: "This will also delete all assigned attributes and links.",
        hardDepInfo: "",
      },
      true // allowForceCascade
    );

    if (dataChanged) {
      await reloadSourceOfferings();
    }
  }

  const sourceOfferingsDeleteStrategy: DeleteStrategy<Wio_PDef_Cat_Supp_Nested_WithLinks> = {
    execute: handleSourceOfferingDelete,
  };

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
      >
        {#snippet toolbar({ selectedIds, deleteSelected }: { selectedIds: Set<ID>, deleteSelected: () => Promise<void> | void })}
          <button
            class="pc-grid__btn pc-grid__btn--secondary"
            disabled={selectedIds.size === 0 || $offeringLoadingState}
            onclick={async () => {
              const ids = Array.from(selectedIds) as ID[];
              await handleSourceOfferingUnlink(ids);
              selectedIds.clear();
            }}
            title={selectedIds.size === 0
              ? "Select source offerings to unlink"
              : `Unlink ${selectedIds.size} selected source offering${selectedIds.size > 1 ? "s" : ""}`}
          >
            Unlink selected ({selectedIds.size})
          </button>

          <button
            class="pc-grid__btn pc-grid__btn--danger"
            disabled={selectedIds.size === 0 || $offeringLoadingState}
            onclick={deleteSelected}
            title={selectedIds.size === 0
              ? "Select source offerings to delete"
              : `Delete ${selectedIds.size} selected source offering${selectedIds.size > 1 ? "s" : ""}`}
          >
            Delete selected ({selectedIds.size})
          </button>
        {/snippet}

        {#snippet rowActions({ row, id, isDeleting }: { row: Wio_PDef_Cat_Supp_Nested_WithLinks, id: ID | null, isDeleting: (id: ID) => boolean })}
          <!-- DELETE (Standard) -->
          <button
            type="button"
            class="pc-grid__btn pc-grid__btn--danger"
            disabled={id === null || $offeringLoadingState}
            onclick={async (e) => {
              e.stopPropagation();
              if (id !== null) {
                await handleSourceOfferingDelete([id]);
              }
            }}
            aria-busy={id !== null && isDeleting(id)}
            title="Delete this source offering"
          >
            {#if id !== null && isDeleting(id)}
              <span class="pc-grid__spinner" aria-hidden="true"></span>
            {/if}
            Delete
          </button>

          <!-- UNLINK (Custom) -->
          <button
            type="button"
            class="row-action-btn"
            onclick={async (e) => {
              e.stopPropagation();
              if (id !== null) {
                await handleSourceOfferingUnlink([id]);
              }
            }}
            disabled={$offeringLoadingState}
            title="Unlink this source offering"
          >
            🔗 Unlink
          </button>
        {/snippet}
      </OfferingGrid>
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
      <ValidationWrapper {errors}>
        <OfferingForm
          initialLoadedData={{
            offering,
            availableProducts,
            availableSuppliers,
            materials,
            forms,
            constructionTypes,
            surfaceFinishes,
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
      </ValidationWrapper>

      <!-- Copy for Shop Section -->
      {#if offering && offering.wholesaler_id !== 99 && !data.isCreateMode}
        <div class="copy-for-shop-section">
          <h3>Shop Integration</h3>
          <p class="hint">Create a shop offering from this source offering</p>

          <ValidationWrapper errors={errors.copyForShop ? { copyForShop: errors.copyForShop } : {}}>
            <button
              type="button"
              class="secondary-button"
              onclick={handleCopyForShop}
              disabled={$offeringLoadingState || copiedShopOfferingId !== null}
            >
              📋 Copy for Shop
            </button>
          </ValidationWrapper>

          {#if copiedShopOfferingId}
            <div class="success-action">
              <p class="success-message">
                ✓ Shop offering created (ID: {copiedShopOfferingId})
              </p>
              <button
                type="button"
                class="primary-button"
                onclick={navigateToShopOffering}
              >
                Go to Shop Offering →
              </button>
            </div>
          {/if}
        </div>
      {/if}
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
  .copy-for-shop-section {
    margin-top: 2rem;
    padding: 1.5rem;
    background: var(--color-background-secondary, #f8f9fa);
    border: 1px dashed var(--color-border);
    border-radius: 8px;
  }
  .copy-for-shop-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
  }
  .copy-for-shop-section .hint {
    margin: 0 0 1rem 0;
    font-size: 0.9rem;
    color: var(--color-muted);
  }
  .success-action {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--color-success-bg, #d4edda);
    border: 1px solid var(--color-success-border, #c3e6cb);
    border-radius: 4px;
  }
  .success-message {
    margin: 0 0 0.75rem 0;
    color: var(--color-success, #155724);
    font-weight: 500;
  }
  .row-action-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    background: var(--color-secondary, #6c757d);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .row-action-btn:hover:not(:disabled) {
    background: var(--color-secondary-hover, #5a6268);
  }
  .row-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
