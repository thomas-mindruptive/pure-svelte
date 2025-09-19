// src/lib/stores/notifications.ts
import { writable } from "svelte/store";
import { v4 as uuidv4 } from "uuid";
import DOMPurify from "dompurify";
import { browser } from "$app/environment";
import { log } from "$lib/utils/logger";

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
      const sanitizedMessage = DOMPurify.sanitize(message.replace(/\n/g, "<br>"));
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
