import { db } from '$lib/server/db';
import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { v4 as uuidv4 } from 'uuid';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  console.log("supplier/page.server: Loading supplier data for ID:", id);

  // --- CREATE MODE ---
  if (id === 'new') {
    // We are creating a new supplier. Return a blank object structure
    // so the form has something to bind to.
    try {
      const allCategories = (await db.query`SELECT category_id, name FROM dbo.product_categories ORDER BY name`).recordset;
      return {
        isNew: true,
        wholesaler: {
          name: '',
          region: '',
          b2b_notes: '',
          status: 'new',
          dropship: false,
          website: ''
        },
        assignedCategories: [],
        availableCategories: allCategories
      };
    } catch (err: any) {
      console.error("Failed to load available categories for new supplier:", err);
      throw error(500, "Database error while preparing new supplier page.");
    }
  }

  // --- EDIT MODE ---
  // If id is not 'new', we assume it's a numeric ID and load existing data.
  const wholesalerId = parseInt(id);
  if (isNaN(wholesalerId)) {
    throw error(400, 'Invalid Supplier ID format.');
  }

  try {
    const wholesalerResult = await db.request().input('id', wholesalerId).query`
      SELECT * FROM dbo.wholesalers WHERE wholesaler_id = @id`;
    const wholesaler = wholesalerResult.recordset[0];

    if (!wholesaler) throw error(404, `Wholesaler with ID ${wholesalerId} not found.`);

    const assignedCategoriesResult = await db.request().input('id', wholesalerId).query`
      SELECT
        wc.category_id, pc.name, wc.comment, wc.link,
        (SELECT COUNT(*) FROM dbo.wholesaler_item_offerings o WHERE o.wholesaler_id = wc.wholesaler_id AND o.category_id = wc.category_id) AS offering_count
      FROM dbo.wholesaler_categories wc
      JOIN dbo.product_categories pc ON wc.category_id = pc.category_id
      WHERE wc.wholesaler_id = @id
      ORDER BY pc.name;
    `;

    const availableCategoriesResult = await db.request().input('id', wholesalerId).query`
      SELECT category_id, name FROM dbo.product_categories
      WHERE category_id NOT IN (SELECT category_id FROM dbo.wholesaler_categories WHERE wholesaler_id = @id)
      ORDER BY name;
    `;

    return {
      isNew: false,
      wholesaler,
      assignedCategories: assignedCategoriesResult.recordset,
      availableCategories: availableCategoriesResult.recordset
    };
  } catch (err: any) {
    console.error(`Failed to load data for supplier ${wholesalerId}:`, err);
    throw error(500, "A database error occurred while loading supplier data.");
  }
};

export const actions: Actions = {
  /**
   * Action for UPDATING an existing wholesaler
   */
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
        .query`UPDATE dbo.wholesalers SET name = @name, region = @region, website = @website, dropship = @dropship WHERE wholesaler_id = @id;`;
    } catch (err: any) {
      console.error("Error updating wholesaler:", err);
      return fail(500, { action: 'update', error: 'Database error while saving.' });
    }

    return { action: 'update', success: 'Supplier updated successfully.' };
  },

  /**
   * Action for CREATING a new wholesaler
   */
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
      console.log("!!!!!!!!!! Before creating new wholesaler:", { name, region, website, dropship });
      result = await db.request()
        .input('name', name).input('region', region)
        .input('website', website).input('dropship', dropship)
        .query`INSERT INTO dbo.wholesalers (name, region, website, dropship, status) OUTPUT inserted.* VALUES (@name, @region, @website, @dropship, 'new');`;
    } catch (err: any) {
      console.error("Error creating wholesaler:", err);
      return fail(500, { error: 'Database error while creating supplier.', name, region, website, dropship });
    }
    console.log("!!!!!!!!!! After creating new wholesaler:", { name, region, website, dropship });
    const newWholesaler = result.recordset[0];
    const pendingKey = uuidv4();
    const pendingData = { key: pendingKey, data: newWholesaler };
    cookies.set('pendingData', JSON.stringify(pendingData), { path: '/', httpOnly: false, maxAge: 60, sameSite: 'lax' });
    // After successful creation, redirect to the LIST page to hydrate it
    throw redirect(303, `/suppliers?pendingKey=${pendingKey}`);
  },

  // The assignCategory and removeCategory actions are only relevant for an existing record
  assignCategory: async ({ request, params }) => { /* ... as before ... */ },
  removeCategory: async ({ request, params }) => { /* ... as before ... */ }
};