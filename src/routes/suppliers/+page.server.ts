import { db } from '$lib/server/db';
import { fail } from '@sveltejs/kit';

export async function load() {
  console.log("Loading data for suppliers...");

  try {
    const result = await db.query`
    SELECT 
      wholesaler_id, 
      name, 
      region, 
      status, 
      dropship 
    FROM 
      dbo.wholesalers 
    ORDER BY 
      name;
  `;

    return {
      wholesalers: result.recordset
    };

  } catch (err: any) {
    console.error("Error in 'assignCategory' action:", err);
    return fail(500, {
      action: 'load',
      error: 'A database error occurred while loading suppliers.'
    });
  }
}
