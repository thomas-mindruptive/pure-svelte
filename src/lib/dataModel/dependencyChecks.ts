import { db } from '$lib/server/db';
import { log } from '$lib/utils/logger';

/**
 * Prüft, ob für eine bestimmte Lieferant-Kategorie-Beziehung noch Abhängigkeiten bestehen.
 * @param wholesalerId Die ID des Lieferanten.
 * @param categoryId Die ID der Kategorie.
 * @param transaction Das Transaktionsobjekt der Datenbank.
 * @returns Die Anzahl der gefundenen Abhängigkeiten (Offerings).
 */
export async function checkCategoryDependencies(wholesalerId: number, categoryId: number, transaction: any): Promise<number> {
    const result = await transaction.request()
        .input('wholesalerId', wholesalerId)
        .input('categoryId', categoryId)
        .query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_item_offerings
      WHERE wholesaler_id = @wholesalerId AND category_id = @categoryId
    `;
    return result.recordset[0].count;
}

export async function checkWholesalerDependencies(wholesalerId: number) {
    const dependencies = [];

    const categoriesCheck = await db.request()
        .input('wholesalerId', wholesalerId)
        .query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_categories 
      WHERE wholesaler_id = @wholesalerId
    `;

    if (categoriesCheck.recordset[0].count > 0) {
        dependencies.push(`${categoriesCheck.recordset[0].count} assigned categories`);
    }

    const offeringsCheck = await db.request()
        .input('wholesalerId', wholesalerId)
        .query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_item_offerings 
      WHERE wholesaler_id = @wholesalerId
    `;

    if (offeringsCheck.recordset[0].count > 0) {
        dependencies.push(`${offeringsCheck.recordset[0].count} product offerings`);
    }

    const linksCheck = await db.request()
        .input('wholesalerId', wholesalerId)
        .query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_offering_links wol
      INNER JOIN dbo.wholesaler_item_offerings wio ON wol.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;

    if (linksCheck.recordset[0].count > 0) {
        dependencies.push(`${linksCheck.recordset[0].count} offering links`);
    }

    const attributesCheck = await db.request()
        .input('wholesalerId', wholesalerId)
        .query`
      SELECT COUNT(*) as count 
      FROM dbo.wholesaler_offering_attributes woa
      INNER JOIN dbo.wholesaler_item_offerings wio ON woa.offering_id = wio.offering_id
      WHERE wio.wholesaler_id = @wholesalerId
    `;

    if (attributesCheck.recordset[0].count > 0) {
        dependencies.push(`${attributesCheck.recordset[0].count} offering attributes`);
    }

    return dependencies;
}
