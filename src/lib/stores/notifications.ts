// src/lib/stores/notifications.ts
import { browser } from "$app/environment";
import { convertToHtml } from "$lib/utils/formatUtils";
import { log } from "$lib/utils/logger";
import { writable } from "svelte/store";
import { v4 as uuidv4 } from "uuid";

export interface Notification {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  timeout: number;
}

export const notifications = writable<Notification[]>([]);

export function addNotification(message: string, type: "success" | "error" | "info" = "info", timeout = 4000) {
  const id = uuidv4();

  if (browser) {
      const sanitizedMessage = convertToHtml(message);
      log.debug(`Raw notification message: ${message}, Sanitized message: ${sanitizedMessage}`);
      message = sanitizedMessage;
  }

  // Fügt eine neue Benachrichtigung zum Store-Array hinzu
  notifications.update((all) => [...all, { id, type, message, timeout }]);

  // Setzt einen Timer, um die Benachrichtigung nach dem Timeout wieder zu entfernen
  setTimeout(() => {
    notifications.update((all) => all.filter((n) => n.id !== id));
  }, timeout);
}
