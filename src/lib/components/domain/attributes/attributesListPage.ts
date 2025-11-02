import { log } from '$lib/utils/logger';
import { type LoadEvent } from '@sveltejs/kit';

import { ApiClient } from '$lib/api/client/apiClient';
import { getAttributeApi } from '$lib/api/client/attribute';

/**
 * Loads the data for the Attribute List Page.
 * It follows the streaming/"App Shell" model by returning a promise for the attributes.
 */
export function load({ fetch }: LoadEvent) {
  log.info(`Kicking off promise for loading attributes...`);

  const client = new ApiClient(fetch);
  const attributeApi = getAttributeApi(client);
  
  // ⚠️ Return the promise directly. The target component must handle it.
  const attributes = attributeApi.loadAttributes();
  
  return { attributes };
}