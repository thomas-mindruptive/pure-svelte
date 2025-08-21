import { goto } from '$app/navigation';
import { addNotification } from '$lib/stores/notifications';

export interface EnhanceOptions {
  entityType: string;           // 'wholesaler', 'category', 'offering', etc.
  createdMessage: string;       // 'Supplier created successfully.'
  updatedMessage: string;       // 'Supplier updated successfully.'
  redirectPattern?: string;     // '/suppliers/{id}' - {id} wird ersetzt
  onSuccess?: (data: any) => void | Promise<void>;  // Custom success callback
  onError?: (error: string) => void;                // Custom error callback
}

/**
 * Erstellt eine generische enhance-Funktion für SvelteKit Form Actions
 * 
 * @param options Konfiguration für die enhance-Funktion
 * @returns SvelteKit enhance function
 */
export function createGenericEnhance(options: EnhanceOptions) {
  return async ({ result }: { result: any }) => {
    // FAILURE HANDLING
    if (result.type === 'failure') {
      const errorMessage = result.data?.error ?? 'Save failed.';
      
      if (options.onError) {
        options.onError(errorMessage);
      } else {
        addNotification(errorMessage, 'error', 5000);
      }
      return;
    }

    // SUCCESS HANDLING  
    if (result.type === 'success') {
      const data = result.data;
      const createdIdKey = `${options.entityType}_id`; // z.B. 'wholesaler_id'
      
      // Check if this was a CREATE operation
      if (data?.created?.[createdIdKey]) {
        // CREATE SUCCESS
        addNotification(options.createdMessage, 'success');
        
        // Navigate to edit page if redirect pattern provided
        if (options.redirectPattern) {
          const newId = data.created[createdIdKey];
          const redirectUrl = options.redirectPattern.replace('{id}', newId);
          await goto(redirectUrl);
        }
      } else {
        // UPDATE SUCCESS
        const successMessage = data?.success ?? options.updatedMessage;
        addNotification(successMessage, 'success');
      }

      // Custom success callback
      if (options.onSuccess) {
        await options.onSuccess(data);
      }
    }
  };
}

// PRESET FUNCTIONS für häufig verwendete Entitäten
export const supplierEnhance = (redirectPattern?: string) => createGenericEnhance({
  entityType: 'wholesaler',
  createdMessage: 'Supplier created successfully.',
  updatedMessage: 'Supplier updated successfully.',
  redirectPattern: redirectPattern ?? '/suppliers/{id}'
});

export const categoryEnhance = (redirectPattern?: string) => createGenericEnhance({
  entityType: 'category', 
  createdMessage: 'Category created successfully.',
  updatedMessage: 'Category updated successfully.',
  redirectPattern: redirectPattern ?? '/categories/{id}'
});

export const offeringEnhance = (redirectPattern?: string) => createGenericEnhance({
  entityType: 'offering',
  createdMessage: 'Product offering created successfully.',
  updatedMessage: 'Product offering updated successfully.',
  redirectPattern: redirectPattern ?? '/offerings/{id}'
});

export const attributeEnhance = (redirectPattern?: string) => createGenericEnhance({
  entityType: 'attribute',
  createdMessage: 'Attribute created successfully.',
  updatedMessage: 'Attribute updated successfully.',
  redirectPattern: redirectPattern
});

// BEISPIEL FÜR CUSTOM ENHANCE
export const customSupplierEnhance = createGenericEnhance({
  entityType: 'wholesaler',
  createdMessage: 'Neuer Lieferant wurde erfolgreich angelegt!',
  updatedMessage: 'Lieferant wurde erfolgreich aktualisiert!',
  redirectPattern: '/suppliers/{id}',
  onSuccess: async (data) => {
    console.log('Custom success logic:', data);
    // Hier könnte z.B. ein Analytics Event getriggert werden
  },
  onError: (error) => {
    console.error('Custom error handling:', error);
    // Custom error handling, z.B. Sentry logging
  }
});