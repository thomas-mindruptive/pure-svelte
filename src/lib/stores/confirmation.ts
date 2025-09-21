// src/lib/stores/confirmation.ts
import { writable } from "svelte/store";

export interface ConfirmationOption {
  name: string;
  description: string;
}
interface ConfirmationState {
  isOpen: boolean;
  message: string;
  title: string;
  options?: ConfirmationOption[] | undefined;
  resolve?: (value: ConfirmationResult) => void;
}

export interface ConfirmationResult {
  confirmed: boolean;
  selectedOptions?: ConfirmationOption[];
}

const initialState: ConfirmationState = {
  isOpen: false,
  message: "",
  title: "Confirmation",
};

const confirmationStore = writable<ConfirmationState>(initialState);

export function reset() {
  confirmationStore.set(initialState);
}

/**
 * Sie gibt eine Promise zurück, die auf die Benutzeraktion wartet.
 * @param message Die Frage, die dem Benutzer angezeigt wird.
 * @param title (Optional) Ein Titel für den Dialog.
 */
export function requestConfirmation(message: string, title = "Confirm", options?: ConfirmationOption[]): Promise<ConfirmationResult> {
  return new Promise<ConfirmationResult>((resolve) => {
    confirmationStore.set({
      isOpen: true,
      message,
      title,
      options,
      resolve, // Die resolve-Funktion wird im Store gespeichert
    });
  });
}

// Exportieren Sie den Store selbst, damit die Komponente ihn abonnieren kann
export default confirmationStore;
