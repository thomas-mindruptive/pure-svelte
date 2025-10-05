<script lang="ts">
  import { default as confirmationStore, type ConfirmationOption } from "$lib/stores/confirmation";
  import { fade } from "svelte/transition";
  import { convertToHtml } from "$lib/utils/formatUtils";
    import { log } from "$lib/utils/logger";

  let dialog: HTMLDialogElement;

  let selectedOptions = $state<ConfirmationOption[]>([]);

  const formattedMessage = $derived.by(() => {
    const messageFromStore = $confirmationStore.message;
    const sanitizedHtml = convertToHtml(messageFromStore);
    log.debug(`formatted store message:`, sanitizedHtml)
    return sanitizedHtml;
  });

  // Reagiert auf Änderungen im Store
  confirmationStore.subscribe((state) => {
    if (state.isOpen) selectedOptions = [];
    if (dialog && state.isOpen && !dialog.open) {
      dialog.showModal();
    } else if (dialog && !state.isOpen && dialog.open) {
      dialog.close();
    }
  });

  function handleConfirm() {
    // Ruft die gespeicherte resolve-Funktion mit 'true' auf
    $confirmationStore.resolve?.({ confirmed: true, selectedOptions });
    confirmationStore.set({ ...$confirmationStore, isOpen: false });
  }

  function handleCancel() {
    // Ruft die gespeicherte resolve-Funktion mit 'false' auf
    $confirmationStore.resolve?.({ confirmed: false, selectedOptions });
    confirmationStore.set({ ...$confirmationStore, isOpen: false });
  }

  // Verhindert das Schließen mit der ESC-Taste, um eine Entscheidung zu erzwingen
  function onCancel(event: Event) {
    event.preventDefault();
    handleCancel();
  }
</script>

<!-- Das 'bind:this' ist entscheidend, um eine Referenz auf das DOM-Element zu erhalten -->
<dialog
  bind:this={dialog}
  oncancel={onCancel}
  class="confirm-dialog"
>
  {#if $confirmationStore.isOpen}
    <div
      class="dialog-content"
      transition:fade={{ duration: 150 }}
    >
      <h3>{$confirmationStore.title}</h3>
      <p>{@html formattedMessage}</p>
      <div id="options">
        {#each $confirmationStore.options ?? [] as option (option.name)}
          <input
            class="option-checkbox"
            type="checkbox"
            name={option.name}
            value={option}
            bind:group={selectedOptions}
          />
          <span>{option.description}</span>
        {/each}
      </div>
      <div class="dialog-actions">
        <button
          class="secondary-button"
          onclick={handleCancel}
        >
          Abbrechen
        </button>
        <button
          class="confirm-button"
          onclick={handleConfirm}
        >
          Bestätigen
        </button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .confirm-dialog {
    border: none;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
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
    user-select: none;
  }
  .confirm-button:hover {
    background-color: #c82333;
  }

  .option-checkbox:not(:first-child) {
    margin-left: 2rem; /* oder margin-top je nach Layout */
  }
</style>
