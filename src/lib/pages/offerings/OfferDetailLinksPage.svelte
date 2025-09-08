<!-- src/lib/pages/offerings/OfferDetailLinksPage.svelte -->
<script lang="ts">
    // ========================================================================
    // --- Component & Type Imports ---
    // ========================================================================

    import LinkGrid from "$lib/components/links/LinkGrid.svelte";
    import OfferingDetailWrapper from "$lib/components/domain/offerings/OfferingDetailWrapper.svelte";
    import type { WholesalerOfferingLink } from "$lib/domain/domainTypes";
    import type {
        ID,
        DeleteStrategy,
        RowActionStrategy,
    } from "$lib/components/grids/Datagrid.types";
    import {
        OfferingDetailLinks_LoadDataSchema,
        type OfferingDetailLinks_LoadData,
        type OfferingDetailLinks_LoadDataAsync,
    } from "./offeringDetail.types";

    // --- SvelteKit & Utility Imports ---
    import { log } from "$lib/utils/logger";
    import { addNotification } from "$lib/stores/notifications";
    import { assertDefined } from "$lib/utils/validation/assertions";

    // --- API & Strategy Imports ---
    import { ApiClient } from "$lib/api/client/ApiClient";
    import {
        getOfferingApi,
        offeringLoadingState,
    } from "$lib/api/client/offering";

    // --- Styles ---
    import "$lib/components/styles/assignment-section.css";
    import "$lib/components/styles/grid-section.css";
    import "$lib/components/styles/detail-page-layout.css";
    import "$lib/components/styles/form-elements.css";

    // ========================================================================
    // --- TYPE DEFINITIONS ---
    // ========================================================================

    interface OfferDetailLinksPageProps {
        data: OfferingDetailLinks_LoadDataAsync;
    }

    // ========================================================================
    // --- PROPS ---
    // ========================================================================

    const { data }: OfferDetailLinksPageProps = $props();

    // ========================================================================
    // --- LOCAL COMPONENT STATE ---
    // ========================================================================

    // Promise resolution state
    let resolvedData = $state<OfferingDetailLinks_LoadData | null>(null);
    let isLoading = $state(true);
    let loadingError = $state<{ message: string; status?: number } | null>(null);

    // Form state
    let newUrl = $state("");
    let newNotes = $state("");
    let isAssigning = $state(false);

    // ========================================================================
    // --- ASYNCHRONOUS LOGIC HANDLING ---
    // ========================================================================

    $effect(() => {
        let aborted = false;

        const processPromises = async () => {
            isLoading = true;
            loadingError = null;
            resolvedData = null;

            try {
                const [offering, links, availableProducts] = await Promise.all([
                    data.offering,
                    data.links,
                    data.availableProducts,
                ]);

                if (aborted) return;

                const dataToValidate = {
                    supplierId: data.supplierId,
                    categoryId: data.categoryId,
                    offering,
                    links,
                    availableProducts,
                };

                const validationResult = OfferingDetailLinks_LoadDataSchema.safeParse(dataToValidate);

                if (!validationResult.success) {
                    log.error("(OfferDetailLinksPage) Zod validation failed", validationResult.error.issues);
                    throw new Error("Received invalid data structure from the API.");
                }

                resolvedData = validationResult.data;
            } catch (rawError: any) {
                if (aborted) return;
                const status = rawError.status ?? 500;
                const message = rawError.message || "Failed to load or validate link details.";
                loadingError = { message, status };
                log.error("(OfferDetailLinksPage) Promise processing failed", { rawError });
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

    // ========================================================================
    // --- API CLIENT ---
    // ========================================================================

    const client = new ApiClient(fetch);
    const offeringApi = getOfferingApi(client);

    // ========================================================================
    // --- BUSINESS LOGIC ---
    // ========================================================================

    /**
     * Reloads links after changes.
     * Updates local state to refresh UI seamlessly.
     */
    async function reloadLinks() {
        assertDefined(resolvedData, "reloadLinks: resolvedData.offering must be defined", ["offering"]);

        log.info("(OfferDetailLinksPage) Re-fetching links...");
        const updatedLinks = await offeringApi.loadOfferingLinks(resolvedData.offering.offering_id);
        resolvedData.links = updatedLinks;
        log.info("(OfferDetailLinksPage) Local state updated with new links.");
    }

    // ========================================================================
    // ===== EVENT HANDLERS =====
    // ========================================================================

    async function handleLinkDelete(ids: ID[]): Promise<void> {
        assertDefined(ids, "OfferDetailLinksPage.handleLinkDelete");
        let dataChanged = false;

        for (const id of ids) {
            const result = await offeringApi.deleteOfferingLink(Number(id));

            if (result.success) {
                dataChanged = true;
            } else {
                // Show server error message if available
                addNotification(
                    result.message ? `Server error: ${result.message}` : 'Could not delete link.',
                    'error'
                );
            }
        }

        if (dataChanged) {
            addNotification('Link(s) deleted.', 'success');
            await reloadLinks();
        }
    }

    function handleLinkSelect(link: WholesalerOfferingLink) {
        assertDefined(link, "OfferDetailLinksPage.handleLinkSelect");
        addNotification(
            `Editing for link "${link.url}" not yet implemented.`,
            "info",
        );
    }

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

    // ========================================================================
    // ===== GRID STRATEGIES =====
    // ========================================================================

    const deleteStrategy: DeleteStrategy<WholesalerOfferingLink> = {
        execute: handleLinkDelete,
    };

    const rowActionStrategy: RowActionStrategy<WholesalerOfferingLink> = {
        click: handleLinkSelect,
    };
</script>

<!-- ====================================================================== -->
<!-- TEMPLATE -->
<!-- ====================================================================== -->

{#if loadingError}
    <div class="component-error-boundary">
        <h3>Error Loading Data (Status: {loadingError.status})</h3>
        <p>{loadingError.message}</p>
    </div>
{:else if isLoading || !resolvedData}
    <div class="detail-page-layout">Loading link details...</div>
{:else}
    <OfferingDetailWrapper
            initialLoadedData={resolvedData}
            availableProducts={resolvedData.availableProducts}
    >
        <div class="grid-section">
            <!-- Assignment Section -->
            <div class="assignment-section">
                <h3>Add New Link</h3>
                {#if !resolvedData.offering}
                    <p class="field-hint">
                        You must save the new offering first before you can add links.
                    </p>
                {/if}
                <form class="assignment-form" onsubmit={handleAssignLink}>
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

            <!-- Links Grid -->
            <h2 style="margin-top: 1.5rem;">Assigned Links</h2>
            {#if !resolvedData.offering}
                <p class="field-hint">
                    You must save the new offering first before you can add/see links.
                </p>
            {:else}
                <LinkGrid
                        rows={resolvedData.links}
                        loading={$offeringLoadingState}
                        {deleteStrategy}
                        {rowActionStrategy}
                />
            {/if}
        </div>
    </OfferingDetailWrapper>
{/if}