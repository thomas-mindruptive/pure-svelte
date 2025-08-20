import { json, error, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { executeGenericQuery } from '$lib/server/queryBuilder'; // Import the new module
import type { QueryPayload } from './queryGrammar';


/**
 * Handles POST requests to the generic query endpoint.
 * It parses the request body, passes it to the secure query builder,
 * and returns the result as JSON.
 */
export const POST: RequestHandler = async ({ request }: RequestEvent) => {
  try {
    // 1. Get the payload from the client request
    const payload: QueryPayload = await request.json();
    
    // 2. Delegate all the complex logic and database work to the query builder
    const data = await executeGenericQuery(payload);

    // 3. Return the data successfully
    return json({ data });

  } catch (err: any) {
    // 4. Catch any errors (validation, database, etc.) from the builder
    console.error("API Route Error:", err.message);
    
    // Return a user-safe "Bad Request" error to the client
    throw error(400, err.message); 
  }
};
