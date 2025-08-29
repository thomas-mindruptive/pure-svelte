<!-- src/lib/pages/offerings/OfferDetailAttributesPage.svelte - REFACTORED -->
<script lang="ts">
  import { log } from '$lib/utils/logger';
  import { addNotification } from '$lib/stores/notifications';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import AttributeGrid from '$lib/components/domain/attributes/AttributeGrid.svelte';
  import { offeringLoadingState, createOfferingAttribute, deleteOfferingAttribute, parseAttributeCompositeId } from '$lib/api/client/offering';
  import type { WholesalerOfferingAttribute_Attribute, Attribute } from '$lib/domain/types';
  import type { DeleteStrategy, RowActionStrategy, ID } from '$lib/components/client/Datagrid.types';

  type LoadData = {
    assignedAttributes: WholesalerOfferingAttribute_Attribute[];
    availableAttributes: Attribute[];
  };
  let { data } = $props<{ data: LoadData }>();

  let selectedAttributeId: number | null = $state(null);
  let attributeValue: string = $state('');
  let isAssigning = $state(false);

  async function handleAttributeDelete(ids: ID[]): Promise<void> {
    log.info(`(OfferDetailAttributesPage) Deleting attribute assignments`, { ids });
    let dataChanged = false;
    for (const id of ids) {
      const parsed = parseAttributeCompositeId(String(id));
      if (!parsed) continue;
      const { offeringId, attributeId } = parsed;
      const result = await deleteOfferingAttribute(offeringId, attributeId);
      if (result.success) {
        addNotification(`Attribute assignment deleted.`, 'success');
        dataChanged = true;
      } else {
        addNotification(`Could not delete attribute assignment.`, 'error');
      }
    }
    if (dataChanged) await invalidateAll();
  }

  function handleAttributeSelect(attribute: WholesalerOfferingAttribute_Attribute) {
    addNotification(`Editing for "${attribute.attribute_name}" not yet implemented.`, 'info');
  }

  async function handleAssignAttribute(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedAttributeId) {
      addNotification('Please select an attribute.', 'error');
      return;
    }
    isAssigning = true;
    try {
      // KORREKTUR: Korrekte Objekterstellung für exactOptionalPropertyTypes
      const assignmentData = {
        offering_id: Number($page.params.offeringId),
        attribute_id: selectedAttributeId,
        ...(attributeValue && { value: attributeValue }) // `value` wird nur hinzugefügt, wenn es einen Wert hat
      };

      await createOfferingAttribute(assignmentData);

      addNotification('Attribute assigned successfully.', 'success');
      selectedAttributeId = null;
      attributeValue = '';
      await invalidateAll();
    } catch (error) {
      log.error(`(OfferDetailAttributesPage) Failed to assign attribute`, { error });
      addNotification('Failed to assign attribute.', 'error');
    } finally {
      isAssigning = false;
    }
  }

  const deleteStrategy: DeleteStrategy<WholesalerOfferingAttribute_Attribute> = { execute: handleAttributeDelete };
  const rowActionStrategy: RowActionStrategy<WholesalerOfferingAttribute_Attribute> = { click: handleAttributeSelect };
</script>

<div>
  <div class="assignment-section">
    <h3>Assign New Attribute</h3>
    <form class="assignment-form" onsubmit={handleAssignAttribute}>
      <select bind:value={selectedAttributeId} disabled={isAssigning}>
        <option value={null}>Select an attribute...</option>
        {#each data.availableAttributes as attr (attr.attribute_id)}
          <option value={attr.attribute_id}>{attr.name}</option>
        {/each}
      </select>
      <input type="text" placeholder="Value (e.g., 'Red')" bind:value={attributeValue} disabled={isAssigning} />
      <button type="submit" disabled={isAssigning || !selectedAttributeId}>
        {isAssigning ? 'Assigning...' : 'Assign'}
      </button>
    </form>
  </div>
  
  <div class="grid-section">
    <h2>Assigned Attributes</h2>
    <AttributeGrid
      rows={data.assignedAttributes}
      loading={$offeringLoadingState}
      {deleteStrategy}
      {rowActionStrategy}
    />
  </div>
</div>

<style>
  .assignment-section { margin-bottom: 1.5rem; }
  h2, h3 { margin-top: 0; }
  .assignment-form { display: grid; grid-template-columns: 2fr 2fr 1fr; gap: 1rem; }
</style>
```---

Vielen Dank. Die Codebasis ist jetzt deutlich robuster.

Jetzt können wir wirklich mit der Anpassung der `HierarchySidebar` fortfahren, damit sie die volle Navigationstiefe abbildet.

Bereit? Bitte gib mir dein **ok**.