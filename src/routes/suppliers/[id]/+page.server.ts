import { db } from '$lib/server/db';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { v4 as uuidv4 } from 'uuid';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  console.log("supplier/page.server: Loading supplier data for ID:", id);

  // --- CREATE MODE ---
  if (id === 'new') {
    try {
      const allCategories = (await db.query`
        SELECT category_id, name FROM dbo.product_categories ORDER BY name
      `).recordset;

      return {
        isNew: true,
        wholesaler: { name: '', region: '', b2b_notes: '', status: 'new', dropship: false, website: '' },
        assignedCategories: [] as any[],
        availableCategories: Array.from(allCategories)
      };
    } catch (err: any) {
      console.error("Failed to load available categories for new supplier:", err);
      throw error(500, "Database error while preparing new supplier page.");
    }
  }

  // --- EDIT MODE ---
  const wholesalerId = parseInt(id);
  if (isNaN(wholesalerId)) {
    throw error(400, 'Invalid Supplier ID format.');
  }

  try {
    const wholesalerResult = await db.request()
      .input('id', wholesalerId)
      .query`SELECT * FROM dbo.wholesalers WHERE wholesaler_id = @id`;

    const wholesaler = wholesalerResult.recordset[0];
    if (!wholesaler) throw error(404, `Wholesaler with ID ${wholesalerId} not found.`);

    const assignedCategoriesResult = await db.request().input('id', wholesalerId).query`
      SELECT
        wc.category_id, pc.name, wc.comment, wc.link,
        (SELECT COUNT(*) FROM dbo.wholesaler_item_offerings o
         WHERE o.wholesaler_id = wc.wholesaler_id
           AND o.category_id = wc.category_id) AS offering_count
      FROM dbo.wholesaler_categories wc
      JOIN dbo.product_categories pc ON wc.category_id = pc.category_id
      WHERE wc.wholesaler_id = @id
      ORDER BY pc.name;
    `;

    const availableCategoriesResult = await db.request().input('id', wholesalerId).query`
      SELECT category_id, name FROM dbo.product_categories
      WHERE category_id NOT IN (
        SELECT category_id FROM dbo.wholesaler_categories WHERE wholesaler_id = @id
      )
      ORDER BY name;
    `;

    return {
      isNew: false,
      wholesaler,
      assignedCategories: Array.from(assignedCategoriesResult.recordset),
      availableCategories: Array.from(availableCategoriesResult.recordset)
    };
  } catch (err: any) {
    console.error(`Failed to load data for supplier ${wholesalerId}:`, err);
    throw error(500, "A database error occurred while loading supplier data.");
  }
};

export const actions: Actions = {
  update: async ({ request, params }) => {
    const wholesalerId = parseInt(params.id);
    if (isNaN(wholesalerId)) return fail(400, { error: 'Invalid ID.' });

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const region = formData.get('region') as string;
    const website = formData.get('website') as string;
    const dropship = formData.get('dropship') === 'on';

    try {
      await db.request()
        .input('id', wholesalerId)
        .input('name', name).input('region', region)
        .input('website', website).input('dropship', dropship)
        .query`UPDATE dbo.wholesalers
               SET name = @name, region = @region, website = @website, dropship = @dropship
               WHERE wholesaler_id = @id;`;
    } catch (err: any) {
      console.error("Error updating wholesaler:", err);
      return fail(500, { action: 'update', error: 'Database error while saving.' });
    }

    return { action: 'update', success: 'Supplier updated successfully.' };
  },

  create: async ({ request, cookies }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const region = formData.get('region') as string;
    const website = formData.get('website') as string;
    const dropship = formData.get('dropship') === 'on';

    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Name is required.', name, region, website, dropship });
    }

    let result;
    try {
      console.log("Before creating new wholesaler:", { name, region, website, dropship });
      result = await db.request()
        .input('name', name).input('region', region)
        .input('website', website).input('dropship', dropship)
        .query`INSERT INTO dbo.wholesalers (name, region, website, dropship, status)
               OUTPUT inserted.* VALUES (@name, @region, @website, @dropship, 'new');`;
    } catch (err: any) {
      console.error("Error creating wholesaler:", err);
      return fail(500, { error: 'Database error while creating supplier.', name, region, website, dropship });
    }

    const newWholesaler = result.recordset[0];
    console.log("After creating new wholesaler:", newWholesaler);

    // Keep cookie if you still need "pendingKey" logic, otherwise remove
    // We currently do NOT use the cookie. The supplier page reloads all suppliers.
    // const pendingKey = uuidv4();
    // cookies.set('pendingData', JSON.stringify({ key: pendingKey, data: newWholesaler }), {
    //   path: '/', httpOnly: false, maxAge: 60, sameSite: 'lax'
    // });

    // No redirect anymore – just return data
    return { action: 'create', success: 'Supplier created successfully.', created: newWholesaler };
  },

  assignCategory: async ({ request, params }) => {
    const wholesalerId = parseInt(params.id);
    if (isNaN(wholesalerId)) {
      return fail(400, { action: 'assignCategory', error: 'Invalid wholesaler ID.' });
    }

    const formData = await request.formData();
    const categoryId = formData.get('categoryId');
    if (!categoryId) {
      return fail(400, { action: 'assignCategory', error: 'Category ID is required.' });
    }

    try {
      const result = await db.request()
        .input('wholesalerId', wholesalerId)
        .input('categoryId', categoryId)
        .query`
          INSERT INTO dbo.wholesaler_categories (wholesaler_id, category_id)
          OUTPUT inserted.category_id
          VALUES (@wholesalerId, @categoryId);
        `;

      const addedCategoryId = result.recordset[0].category_id;
      // Load category name for client
      const category = await db.request().input('id', addedCategoryId).query`
        SELECT category_id, name FROM dbo.product_categories WHERE category_id = @id
      `;

      return {
        action: 'assignCategory',
        success: 'Category assigned successfully.',
        addedCategory: category.recordset[0]
      };
    } catch (err: any) {
      console.error("Error assigning category:", err);
      return fail(500, { action: 'assignCategory', error: 'Database error while assigning category.' });
    }
  },

  removeCategory: async ({ request, params }) => {
    const wholesalerId = parseInt(params.id);
    if (isNaN(wholesalerId)) {
      return fail(400, { action: 'removeCategory', error: 'Invalid wholesaler ID.' });
    }

    const formData = await request.formData();
    const categoryId = formData.get('categoryId');
    if (!categoryId) {
      return fail(400, { action: 'removeCategory', error: 'Category ID is required.' });
    }

    try {
      await db.request()
        .input('wholesalerId', wholesalerId)
        .input('categoryId', categoryId)
        .query`DELETE FROM dbo.wholesaler_categories
               WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId;`;

      return {
        action: 'removeCategory',
        success: 'Category removed successfully.',
        removedCategoryId: Number(categoryId)
      };
    } catch (err: any) {
      if (err.number === 547) {
        return fail(409, {
          action: 'removeCategory',
          error: 'Cannot remove: Offerings still exist for this category.'
        });
      }
      console.error("Error removing category:", err);
      return fail(500, { action: 'removeCategory', error: 'A database error occurred.' });
    }
  }
};
