import type { PageLoad } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { extractDbCols, type ColumnDefinitionInclDB } from '$lib/clientAndBack/columnDefinitions';
import { type SortDescriptor, type QueryPayload, LogicalOperator, ComparisonOperator } from '../api/query/queryGrammar';

// ===================================================================
// THIS IS NOW THE SINGLE SOURCE OF TRUTH FOR THIS PAGE'S GRID
// ===================================================================
const columnDefs: ColumnDefinitionInclDB[] = [
  { key: 'wholesaler_id', title: 'ID', sortable: true, type: 'number', width: '0.5fr' },
  { key: 'name', title: 'Supplier Name', sortable: true, width: '3fr' },
  { key: 'region', title: 'Region', sortable: true, width: '2fr' },
  { key: 'status', title: 'Status', sortable: true, width: '1fr' },
  { key: 'dropship', title: 'Dropshipping', sortable: true, type: 'string', width: '1fr' },
  { key: 'website', title: 'Website', sortable: false, width: '2fr' }
];

/**
 * This universal `load` function runs on the server for the initial request,
 * and in the browser for all subsequent client-side navigations.
 */
export const load: PageLoad = async ({ url, fetch }) => {
  try {
    // 1. Read the current state from the URL search parameters.
    const filterText = url.searchParams.get('filter') || '';
    const sortKey = url.searchParams.get('sort') || 'name';
    const sortDir = url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
    const sort: SortDescriptor = { key: sortKey, direction: sortDir };

    // 2. Construct the query payload using our SINGLE SOURCE OF TRUTH.
    const query: QueryPayload = {
      // The select clause is now generated dynamically!
      select: extractDbCols(columnDefs),
      from: 'dbo.wholesalers',
      where: {
        op: LogicalOperator.AND,
        conditions: filterText
          ? [{ key: 'name', op: ComparisonOperator.LIKE, val: `%${filterText}%` }]
          : []
      },
      orderBy: [sort],
      limit: 50,
      offset: 0
    };

    // 3. Call the generic API endpoint.
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    });

    if (!response.ok) {
      throw new Error('Failed to fetch suppliers.');
    }

    const result = await response.json();

    // 4. Return the data AND the definitions used to fetch it.
    return {
      wholesalers: result.data,
      columnDefs: columnDefs, // Pass the definitions to the Svelte component
      filterText: filterText,
      sort: sort
    };
  }
  catch (err: any) {
    console.error("!!!!!!!!!!!!!!!!! ERROR IN SUPPLIERS LIST LOAD FUNCTION !!!!!!!!!!!!!!!");
    console.error(err);
    // This will force SvelteKit to show a proper error page instead of a blank one.
    throw error(500, "The supplier list page failed to load. Check server logs.");
  }
};