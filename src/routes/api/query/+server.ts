// src/routes/api/query/+server.ts
import { json, error, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { executeGenericQuery } from '$lib/server/queryBuilder';
import type { QueryPayload } from '../../../lib/clientAndBack/queryGrammar';
// KORREKTUR: Die Konfiguration für die Abfragesicherheit muss importiert werden.
import { supplierQueryConfig } from '$lib/server/supplierQueryConfig';


/**
 * Handles POST requests to the generic query endpoint.
 * It parses the request body, passes it to the secure query builder,
 * and returns the result as JSON.
 */
export const POST: RequestHandler = async ({ request }: RequestEvent) => {
  try {
    // 1. Get the payload from the client request
    const payload: QueryPayload = await request.json();
    
    // KORREKTUR: Das 'config'-Objekt wurde als zweites Argument übergeben.
    const data = await executeGenericQuery(payload, supplierQueryConfig);

    // 3. Return the data successfully
    return json({ data });

  } catch (err: any) {
    // 4. Catch any errors (validation, database, etc.) from the builder
    console.error("API Route Error:", err.message);
    
    // Return a user-safe "Bad Request" error to the client
    throw error(400, err.message); 
  }
};