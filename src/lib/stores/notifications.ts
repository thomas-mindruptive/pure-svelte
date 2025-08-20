// src/lib/stores/notifications.ts
import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid'; // `npm install uuid` & `npm install -D @types/uuid`

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  timeout: number;
}

// `writable` erstellt einen Store, den wir von überall beschreiben können
export const notifications = writable<Notification[]>([]);

// Das ist unsere "Helfer"-Funktion, die wir in unseren Seiten aufrufen werden
export function addNotification(message: string, type: 'success' | 'error' | 'info' = 'info', timeout = 3000) {
  const id = uuidv4();
  
  // Fügt eine neue Benachrichtigung zum Store-Array hinzu
  notifications.update((all) => [...all, { id, type, message, timeout }]);

  // Setzt einen Timer, um die Benachrichtigung nach dem Timeout wieder zu entfernen
  setTimeout(() => {
    notifications.update((all) => all.filter(n => n.id !== id));
  }, timeout);
}