<!-- src/lib/pages/offerings/OfferDetailLinksPage.svelte -->
<script lang="ts">
  import { addNotification } from '$lib/stores/notifications';
  import { invalidateAll } from '$app/navigation';

  import LinkGrid from '$lib/components/links/LinkGrid.svelte';
  import { offeringLoadingState, createOfferingLink, deleteOfferingLink } from '$lib/api/client/offering';
  import type { WholesalerOfferingLink, WholesalerItemOffering_ProductDef_Category } from '$lib/domain/types';
  import type { DeleteStrategy, RowActionStrategy, ID } from '$lib/components/client/Datagrid.types';

  type LoadData = {
    offering: WholesalerItemOffering_ProductDef_Category;
    links: WholesalerOfferingLink[];
  };
  let { data } = $props<{ data: LoadData }>();

  let newUrl = $state('');
  let newNotes = $state('');
  let isAssigning = $state(false);

  async function handleLinkDelete(ids: ID[]): Promise<void> {
    for (const id of ids) {
      await deleteOfferingLink(Number(id));
    }
    addNotification('Link(s) deleted.', 'success');
    await invalidateAll();
  }

  function handleLinkSelect(link: WholesalerOfferingLink) {
    addNotification(`Editing for link "${link.url}" not yet implemented.`, 'info');
  }

  // KORREKTUR: Der Handler empfängt das Event-Objekt.
  async function handleAssignLink(event: SubmitEvent) {
    // KORREKTUR: Das Standardverhalten wird hier programmatisch verhindert.
    event.preventDefault();

    if (!newUrl) return;
    isAssigning = true;
    try {
      const linkData: Omit<WholesalerOfferingLink, 'link_id'> = {
        offering_id: data.offering.offering_id,
        url: newUrl,
        ...(newNotes && { notes: newNotes })
      };
      await createOfferingLink(linkData);
      
      addNotification('Link added.', 'success');
      newUrl = '';
      newNotes = '';
      await invalidateAll();
    } finally {
      isAssigning = false;
    }
  }

  const deleteStrategy: DeleteStrategy<WholesalerOfferingLink> = { execute: handleLinkDelete };
  const rowActionStrategy: RowActionStrategy<WholesalerOfferingLink> = { click: handleLinkSelect };
</script>

<div class="page-layout">
  <div class="header-section">
    <h1>Manage Links for "{data.offering.product_def_title}"</h1>
    <p>
      Offering ID: {data.offering.offering_id} / Price: {data.offering.price} {data.offering.currency}
    </p>
  </div>
  
  <div class="form-section placeholder">
    <h3>Offering Details</h3>
    <p>A full form (`OfferingForm.svelte`) for editing offering details like price, size, and comments would be rendered here.</p>
  </div>

  <div class="assignment-section">
    <h3>Add New Link</h3>
    <!-- KORREKTUR: Standard-onsubmit-Handler ohne Modifier. -->
    <form class="assignment-form" onsubmit={handleAssignLink}>
      <input type="url" placeholder="https://example.com/product" bind:value={newUrl} required disabled={isAssigning} />
      <input type="text" placeholder="Optional notes..." bind:value={newNotes} disabled={isAssigning} />
      <button type="submit" disabled={isAssigning || !newUrl}>
        {isAssigning ? 'Adding...' : 'Add Link'}
      </button>
    </form>
  </div>
  
  <div class="grid-section">
    <h2>Assigned Links</h2>
    <LinkGrid rows={data.links} loading={$offeringLoadingState} {deleteStrategy} {rowActionStrategy} />
  </div>
</div>

<style>
  .page-layout { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
  .header-section { padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); }
  h1 { margin: 0; }
  p { margin: 0.5rem 0 0 0; color: var(--color-muted); }
  .form-section.placeholder { background-color: #fefce8; border-color: #facc15; color: #713f12; padding: 1.5rem; border-radius: 8px; }
  .assignment-section, .grid-section { background: var(--color-background); border-radius: 8px; border: 1px solid var(--color-border); padding: 1.5rem; }
  h2, h3 { margin-top: 0; }
  .assignment-form { display: grid; grid-template-columns: 2fr 2fr 1fr; gap: 1rem; }
</style>