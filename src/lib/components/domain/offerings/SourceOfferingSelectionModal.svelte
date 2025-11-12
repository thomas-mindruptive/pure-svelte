<!-- src/lib/components/domain/offerings/SourceOfferingSelectionModal.svelte -->
<script lang="ts">
  import OfferingReportGrid from "$lib/components/domain/reports/offerings/OfferingReportGrid.svelte";
  import { getOfferingApi, offeringLoadingState } from "$lib/api/client/offering";
  import { ApiClient } from "$lib/api/client/apiClient";
  import type { WhereConditionGroup } from "$lib/backendQueries/queryGrammar";
  import type { OfferingReportViewWithLinks } from "$lib/domain/domainTypes";
  import type { ID } from "$lib/components/grids/Datagrid.types";
  import { log } from "$lib/utils/logger";
  import { getErrorMessage } from "$lib/api/client/common";
  import { addNotification } from "$lib/stores/notifications";

  // === PROPS ====================================================================================

  interface Props {
    isOpen: boolean;
    shopOfferingId: number;
    productDefId: number;
    alreadyLinkedOfferingIds: number[];
    fetch: typeof fetch;
    onConfirm: (selectedOfferings: OfferingReportViewWithLinks[]) => Promise<void>;
    onCancel: () => void;
  }

  let {
    isOpen = $bindable(false),
    shopOfferingId,
    productDefId,
    alreadyLinkedOfferingIds = [],
    fetch: fetchFn,
    onConfirm,
    onCancel
  }: Props = $props();

  // === STATE ====================================================================================

  let dialogElement: HTMLDialogElement;
  let offerings = $state<OfferingReportViewWithLinks[]>([]);
  let selectedIds = $state<Set<ID>>(new Set());
  let rawWhere = $state<string | null>(null);  // Superuser raw WHERE clause

  // === API ======================================================================================

  const client = new ApiClient(fetchFn);
  const offeringApi = getOfferingApi(client);

  // === LIFECYCLE ================================================================================

  $effect(() => {
    if (isOpen && dialogElement) {
      if (!dialogElement.open) {
        dialogElement.showModal();
        selectedIds.clear();
        loadOfferings();
      }
    } else if (!isOpen && dialogElement?.open) {
      dialogElement.close();
      selectedIds.clear();
    }
  });

  // === LOAD DATA ================================================================================

  async function loadOfferings(queryGrammar?: any) {
    try {
      const excludeIds = [shopOfferingId, ...alreadyLinkedOfferingIds];

      const baseConditions: any[] = [
        { key: "pdefId", whereCondOp: "=", val: productDefId },
      ];

      for (const excludeId of excludeIds) {
        baseConditions.push({ key: "wioId", whereCondOp: "!=", val: excludeId });
      }

      const where: WhereConditionGroup<any> = {
        whereCondOp: "AND",
        conditions: baseConditions
      };

      if (queryGrammar?.where) {
        where.conditions.push(queryGrammar.where);
      }

      const results = await offeringApi.loadOfferingsForReportWithLinks(
        where,
        queryGrammar?.orderBy || null,
        null,
        null,
        rawWhere  // Pass rawWhere to API
      );

      offerings = results as OfferingReportViewWithLinks[];
      log.info(`[SourceOfferingSelectionModal] Loaded ${offerings.length} offerings`);
    } catch (err) {
      const message = getErrorMessage(err);
      addNotification(`Failed to load offerings: ${message}`, "error");
      log.error("[SourceOfferingSelectionModal] Failed to load offerings", { error: err });
    }
  }

  function handleQueryChange(queryGrammar: any) {
    loadOfferings(queryGrammar);
  }

  function handleRawWhereChange(newRawWhere: string | null) {
    log.info(`[SourceOfferingSelectionModal] Raw WHERE changed:`, newRawWhere);
    rawWhere = newRawWhere;
    // Datagrid triggers handleQueryChange automatically, just like with filters
  }

  async function handleConfirm(selectedIds: Set<ID>) {
    const selectedOfferings = offerings.filter(o => selectedIds.has(o.wioId));
    log.info(`[SourceOfferingSelectionModal] Confirming ${selectedOfferings.length} selections`);

    try {
      await onConfirm(selectedOfferings);
    } catch (err) {
      log.error("[SourceOfferingSelectionModal] Confirm failed", { error: err });
    }
  }

  function handleCancel() {
    onCancel();
  }

  function handleDialogCancel(event: Event) {
    event.preventDefault();
    handleCancel();
  }
</script>

<dialog
  bind:this={dialogElement}
  oncancel={handleDialogCancel}
  class="source-offering-modal"
>
  {#if isOpen}
    <div class="modal-content">
      <h2>Select Source Offerings</h2>

      <div class="modal-body">
        <OfferingReportGrid
          rows={offerings}
          onQueryChange={handleQueryChange}
          maxBodyHeight="60vh"
          selection="multiple"
          onSelectionChange={(ids) => selectedIds = ids}
          showSuperuserWhere={true}
          onRawWhereChange={handleRawWhereChange}
        >
          {#snippet toolbar({ selectedIds: toolbarSelectedIds })}
            <div class="toolbar-info">
              <span class="selection-count">
                {toolbarSelectedIds.size} offering{toolbarSelectedIds.size !== 1 ? 's' : ''} selected
              </span>
            </div>
          {/snippet}
        </OfferingReportGrid>
      </div>

      <div class="modal-actions">
        <button
          class="secondary-button"
          onclick={handleCancel}
          disabled={$offeringLoadingState}
        >
          Cancel
        </button>
        <button
          class="confirm-button"
          onclick={() => handleConfirm(selectedIds)}
          disabled={selectedIds.size === 0 || $offeringLoadingState}
        >
          Link {selectedIds.size} Offering{selectedIds.size !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .source-offering-modal {
    border: none;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    padding: 0;
    max-width: 90vw;
    width: 100vw;
    max-height: 90vh;
  }

  .source-offering-modal::backdrop {
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(3px);
  }

  .modal-content {
    padding: 1.5rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }

  h2 {
    font-size: 1.25rem;
    margin: 0;
    color: var(--color-heading);
  }

  .modal-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .toolbar-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .selection-count {
    font-weight: 500;
    color: var(--color-text);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, #e0e0e0);
  }

  .modal-actions button {
    padding: 0.6rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .secondary-button {
    background-color: var(--color-secondary, #6c757d);
    color: white;
  }

  .secondary-button:hover:not(:disabled) {
    background-color: var(--color-secondary-dark, #5a6268);
  }

  .confirm-button {
    background-color: var(--color-primary, #007bff);
    color: white;
  }

  .confirm-button:hover:not(:disabled) {
    background-color: var(--color-primary-dark, #0056b3);
  }

  .modal-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
