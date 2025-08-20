import { db } from '$lib/server/db';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

/**
 * Loads all data required for the wholesaler detail page.
 * This function runs on the server before the page is rendered.
 * It has a top-level try-catch block because a failure here is critical
 * and should result in a 500 error page.
 */
export const load: PageServerLoad = async ({ params }) => {
  try {
    const wholesalerId = params.id;

    // --- 1. Load Wholesaler Master Data ---
    const wholesalerResult = await db.request().input('id', wholesalerId).query`
      SELECT wholesaler_id, name, region, b2b_notes, status, dropship, website
      FROM dbo.wholesalers 
      WHERE wholesaler_id = @id;
    `;

    const wholesaler = wholesalerResult.recordset[0];

    // If the main entity doesn't exist, it's a "Not Found" error.
    if (!wholesaler) {
      throw error(404, { message: `Wholesaler with ID ${wholesalerId} not found.` });
    }

    // --- 2. Load Assigned Categories ---
    const assignedCategoriesResult = await db.request().input('id', wholesalerId).query`
      SELECT
        wc.category_id,
        pc.name,
        wc.comment,
        wc.link,
        (SELECT COUNT(*) 
         FROM dbo.wholesaler_item_offerings o 
         WHERE o.wholesaler_id = wc.wholesaler_id AND o.category_id = wc.category_id) AS offering_count
      FROM dbo.wholesaler_categories wc
      JOIN dbo.product_categories pc ON wc.category_id = pc.category_id
      WHERE wc.wholesaler_id = @id
      ORDER BY pc.name;
    `;

    // --- 3. Load Available Categories for assignment ---
    const availableCategoriesResult = await db.request().input('id', wholesalerId).query`
      SELECT category_id, name
      FROM dbo.product_categories
      WHERE category_id NOT IN (
        SELECT category_id FROM dbo.wholesaler_categories WHERE wholesaler_id = @id
      )
      ORDER BY name;
    `;

    // --- Successfully loaded all data ---
    return {
      wholesaler,
      assignedCategories: assignedCategoriesResult.recordset,
      availableCategories: availableCategoriesResult.recordset
    };

  } catch (err: any) {
    // This catches errors from any of the await calls above.
    // We log the specific technical error for debugging purposes.
    console.error(`Fatal error in load function for wholesaler ID ${params.id}:`, err);

    // We re-throw a generic, user-safe error to SvelteKit, which will render a 500 page.
    // We don't want to leak database details to the client.
    throw error(500, "There was a problem loading the wholesaler's data. Please try again later.");
  }
};

/**
 * Defines server-side actions to handle form submissions.
 * Each action has its own try-catch block to handle failures gracefully
 * without crashing the entire page load process.
 */
export const actions: Actions = {

  updateProperties: async ({ request, params }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const region = formData.get('region') as string;
    const website = formData.get('website') as string;
    const dropship = formData.get('dropship') === 'on';

    try {
      await db.request()
        .input('id', params.id)
        .input('name', name)
        .input('region', region)
        .input('website', website)
        .input('dropship', dropship)
        .query`
          UPDATE dbo.wholesalers
          SET name = @name, region = @region, website = @website, dropship = @dropship
          WHERE wholesaler_id = @id;
        `;
      
      return { action: 'updateProperties', success: 'Master data saved successfully.' };

    } catch (err: any) {
      console.error("Error in 'updateProperties' action:", err);
      return fail(500, {
        action: 'updateProperties',
        error: 'A database error occurred while saving. Please try again.'
      });
    }
  },

  assignCategory: async ({ request, params }) => {
    const formData = await request.formData();
    const categoryId = formData.get('categoryId');

    if (!categoryId) {
      return fail(400, { action: 'assignCategory', error: 'Category ID is required.' });
    }

    try {
      await db.request()
        .input('wholesalerId', params.id)
        .input('categoryId', categoryId)
        .query`
          IF NOT EXISTS (SELECT 1 FROM dbo.wholesaler_categories WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId)
          BEGIN
            INSERT INTO dbo.wholesaler_categories (wholesaler_id, category_id)
            VALUES (@wholesalerId, @categoryId);
          END
        `;
      
      return { action: 'assignCategory', success: 'Category assigned successfully.' };

    } catch (err: any) {
      console.error("Error in 'assignCategory' action:", err);
      return fail(500, {
        action: 'assignCategory',
        error: 'A database error occurred while assigning the category.'
      });
    }
  },

  removeCategory: async ({ request, params }) => {
    const formData = await request.formData();
    const categoryId = formData.get('categoryId');

    if (!categoryId) {
      return fail(400, { action: 'removeCategory', error: 'Category ID is required.' });
    }

    try {
      await db.request()
        .input('wholesalerId', params.id)
        .input('categoryId', categoryId)
        .query`
          DELETE FROM dbo.wholesaler_categories
          WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId;
        `;

      return { action: 'removeCategory', success: 'Category removed successfully.' };

    } catch (err: any) {
      // Specifically catch the foreign key constraint violation (error code 547)
      if (err.number === 547) {
        console.warn(`Attempted to delete a category with existing offerings. WholesalerID: ${params.id}, CategoryID: ${categoryId}`);
        return fail(409, { // 409 Conflict is the appropriate HTTP status code
          action: 'removeCategory',
          error: 'Cannot remove this category because it still has product offerings assigned to it.'
        });
      }

      // Catch any other database errors
      console.error("Error in 'removeCategory' action:", err);
      return fail(500, {
        action: 'removeCategory',
        error: 'A general database error occurred while trying to remove the category.'
      });
    }
  }
};