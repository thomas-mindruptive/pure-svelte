// src/lib/stores/confirmation.ts
import { writable } from 'svelte/store';

interface ConfirmationState {
  isOpen: boolean;
  message: string;
  title: string;
  // Das ist der Schlüssel: Wir speichern die 'resolve'-Funktion der Promise
  resolve?: (value: boolean) => void; 
}

const initialState: ConfirmationState = {
  isOpen: false,
  message: '',
  title: 'Confirmation',
};

// Erstellen des writable Stores
const confirmationStore = writable<ConfirmationState>(initialState);

// Funktion zum Zurücksetzen des Stores
export function reset() {
  confirmationStore.set(initialState);
}

/**
 * Sie gibt eine Promise zurück, die auf die Benutzeraktion wartet.
 * @param message Die Frage, die dem Benutzer angezeigt wird.
 * @param title (Optional) Ein Titel für den Dialog.
 */
export function requestConfirmation(message: string, title = 'Confirm'): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    confirmationStore.set({
      isOpen: true,
      message,
      title,
      resolve, // Die resolve-Funktion wird im Store gespeichert
    });
  });
}

// Exportieren Sie den Store selbst, damit die Komponente ihn abonnieren kann
export default confirmationStore;