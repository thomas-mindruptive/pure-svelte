import { db } from '$lib/server/db';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { v4 as uuidv4 } from 'uuid';
import { log } from '$lib/utils/logger';
import {checkCategoryDependencies} from '$lib/dataModel/dependencyChecks';



/**
 * Führt ein Kaskaden-Löschen für alle Daten durch, die von einer
 * Lieferant-Kategorie-Beziehung abhängen.
 * @param wholesalerId Die ID des Lieferanten.
 * @param categoryId Die ID der Kategorie.
 * @param transaction Das Transaktionsobjekt der Datenbank.
 */
async function cascadeDeleteCategory(wholesalerId: number, categoryId: number, transaction: any) {
  const offeringIdsResult = await transaction.request()
    .input('wholesalerId', wholesalerId)
    .input('categoryId', categoryId)
    .query`SELECT offering_id FROM dbo.wholesaler_item_offerings WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId`;

  const offeringIds = offeringIdsResult.recordset.map((r: any) => r.offering_id);

  if (offeringIds.length > 0) {
    // Sicherstellen, dass die offeringIds-Liste nicht leer ist, um SQL-Fehler zu vermeiden
    const offeringIdList = offeringIds.join(',');

    // Schritt 1: Untergeordnete Links und Attribute löschen
    await transaction.request()
      .query(`DELETE FROM dbo.wholesaler_offering_attributes WHERE offering_id IN (${offeringIdList})`);
    await transaction.request()
      .query(`DELETE FROM dbo.wholesaler_offering_links WHERE offering_id IN (${offeringIdList})`);
    
    // Schritt 2: Die Offerings selbst löschen
    await transaction.request()
      .input('wholesalerId', wholesalerId)
      .input('categoryId', categoryId)
      .query`DELETE FROM dbo.wholesaler_item_offerings WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId`;
  }

  // Schritt 3: Die eigentliche Kategorie-Zuweisung löschen
  await transaction.request()
    .input('wholesalerId', wholesalerId)
    .input('categoryId', categoryId)
    .query`DELETE FROM dbo.wholesaler_categories WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId`;
}


export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  log.info({ supplierId: id }, "Loading supplier data");

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
      log.error(err, "Failed to load available categories for new supplier");
      throw error(500, "Database error while preparing new supplier page.");
    }
  }

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
    log.error(err, `Failed to load data for supplier ${wholesalerId}`);
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
      log.error("Error updating wholesaler:", err);
      return fail(500, { action: 'update', error: 'Database error while saving.' });
    }

    return { action: 'update', success: 'Supplier updated successfully.' };
  },

  create: async ({ request }) => {
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
      result = await db.request()
        .input('name', name).input('region', region)
        .input('website', website).input('dropship', dropship)
        .query`INSERT INTO dbo.wholesalers (name, region, website, dropship, status)
               OUTPUT inserted.* VALUES (@name, @region, @website, @dropship, 'new');`;
    } catch (err: any) {
      log.error("Error creating wholesaler:", err);
      return fail(500, { error: 'Database error while creating supplier.', name, region, website, dropship });
    }

    const newWholesaler = result.recordset[0];
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
      const category = await db.request().input('id', addedCategoryId).query`
        SELECT category_id, name FROM dbo.product_categories WHERE category_id = @id
      `;

      return {
        action: 'assignCategory',
        success: 'Category assigned successfully.',
        addedCategory: category.recordset[0]
      };
    } catch (err: any) {
      log.error("Error assigning category:", err);
      return fail(500, { action: 'assignCategory', error: 'Database error while assigning category.' });
    }
  },

  removeCategory: async ({ request, params }) => {
    log.info({ params, action: 'removeCategory' }, 'ACTION START: removeCategory');
  
    const wholesalerId = parseInt(params.id);
    if (isNaN(wholesalerId)) {
      return fail(400, { action: 'removeCategory', error: 'Invalid wholesaler ID.' });
    }
  
    const formData = await request.formData();
    const categoryIdStr = formData.get('categoryId') as string;
    const cascade = formData.get('cascade') === 'true';
  
    log.info({ categoryId: categoryIdStr, cascade }, 'Received form data');
  
    if (!categoryIdStr) {
      return fail(400, { action: 'removeCategory', error: 'Category ID is required.' });
    }
    const categoryId = parseInt(categoryIdStr);
  
    const transaction = db.transaction();
    try {
      await transaction.begin();
      log.info({ wholesalerId, categoryId }, 'Database transaction started');
  
      log.info('Checking for category dependencies...');
      const dependencyCount = await checkCategoryDependencies(wholesalerId, categoryId, transaction);
  
      log.info({ dependencyCount }, 'Dependency check complete');
  
      if (dependencyCount > 0 && !cascade) {
        log.warn({ dependencyCount }, 'Dependencies found, but cascade is false. Rolling back and sending fail(409).');
        await transaction.rollback();
        return fail(409, {
          action: 'removeCategory',
          error: `Cannot remove: ${dependencyCount} offerings still exist in this category.`,
          showCascadeOption: true,
          categoryId: categoryId 
        });
      }
  
      if (dependencyCount > 0 && cascade) {
        log.info({ dependencyCount }, 'Dependencies found and cascade is true. Proceeding with cascade delete.');
        await cascadeDeleteCategory(wholesalerId, categoryId, transaction);
      } else {
        log.info('No dependencies found. Proceeding with simple delete.');
        await transaction.request()
          .input('wholesalerId', wholesalerId)
          .input('categoryId', categoryId)
          .query`DELETE FROM dbo.wholesaler_categories WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId;`;
      }
  
      await transaction.commit();
      log.info('Transaction committed successfully.');
      return {
        action: 'removeCategory',
        success: 'Category and all related data removed successfully.',
        removedCategoryId: categoryId
      };
  
    } catch (err: any) {
      await transaction.rollback();
      log.error(err, "CRITICAL ERROR in removeCategory action. Transaction rolled back.");
      return fail(500, { action: 'removeCategory', error: 'A database error occurred.' });
    }
  }
};