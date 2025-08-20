
<script lang="ts">
  import { default as confirmationStore, requestConfirmation } from '$lib/stores/confirmation';
  import { fade } from 'svelte/transition';

  let dialog: HTMLDialogElement;

  // Reagiert auf Änderungen im Store
  confirmationStore.subscribe(state => {
    if (dialog && state.isOpen && !dialog.open) {
      dialog.showModal();
    } else if (dialog && !state.isOpen && dialog.open) {
      dialog.close();
    }
  });

  function handleConfirm() {
    // Ruft die gespeicherte resolve-Funktion mit 'true' auf
    $confirmationStore.resolve?.(true);
    confirmationStore.set({ ...$confirmationStore, isOpen: false });
  }

  function handleCancel() {
    // Ruft die gespeicherte resolve-Funktion mit 'false' auf
    $confirmationStore.resolve?.(false);
    confirmationStore.set({ ...$confirmationStore, isOpen: false });
  }

  // Verhindert das Schließen mit der ESC-Taste, um eine Entscheidung zu erzwingen
  function onCancel(event: Event) {
    event.preventDefault();
    handleCancel();
  }
</script>

<!-- Das 'bind:this' ist entscheidend, um eine Referenz auf das DOM-Element zu erhalten -->
<dialog bind:this={dialog} on:cancel={onCancel} class="confirm-dialog">
  {#if $confirmationStore.isOpen}
    <div class="dialog-content" transition:fade={{ duration: 150 }}>
      <h3>{$confirmationStore.title}</h3>
      <p>{$confirmationStore.message}</p>
      <div class="dialog-actions">
        <button class="secondary-button" on:click={handleCancel}>Abbrechen</button>
        <button class="confirm-button" on:click={handleConfirm}>Bestätigen</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .confirm-dialog {
    border: none;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    padding: 0;
    max-width: 450px;
    width: 90%;
  }

  /* Styling für den Hintergrund, wenn der Dialog offen ist */
  .confirm-dialog::backdrop {
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(3px);
  }

  .dialog-content {
    padding: 1.5rem 2rem;
  }

  h3 {
    font-size: 1.25rem;
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--color-heading);
  }

  p {
    margin-bottom: 2rem;
    line-height: 1.6;
    color: var(--color-text);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .dialog-actions button {
    padding: 0.6rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .confirm-button {
    background-color: #dc3545; /* Rot für eine destruktive Aktion */
    color: white;
  }
  .confirm-button:hover {
    background-color: #c82333;
  }

  .secondary-button {
    background-color: #f1f5f9;
    color: var(--color-text);
    border: 1px solid var(--color-border);
  }
  .secondary-button:hover {
    background-color: #e2e8f0;
  }
</style>