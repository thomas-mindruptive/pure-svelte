import { db } from "$lib/backendQueries/db";
import { loadNestedOfferingWithJoinsAndLinksForId } from "$lib/backendQueries/entityOperations/offering";
import { WholesalerItemOfferingForCreateSchema } from "$lib/domain/domainTypes";
import type { z } from "zod";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { v4 as uuidv4 } from "uuid";
import { log } from "$lib/utils/logger";

/**
 * POST /api/offerings/[id]/copy-for-shop
 *
 * Creates a shop offering (wholesaler_id = 99) by copying a source offering.
 * Links the new shop offering to the source via shop_offering_sources table.
 *
 * Returns: { shop_offering_id: number }
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const operationId = uuidv4();
  const info = `POST /api/offerings/${params.id}/copy-for-shop - ${operationId}`;
  log.infoHeader(info);

  const { id } = params;
  const sourceOfferingId = parseInt(id, 10);

  if (isNaN(sourceOfferingId)) {
    throw error(400, "Invalid offering ID");
  }

  const transaction = db.transaction();

  try {
    await transaction.begin();

    // 1. Load source offering
    const sourceJsonString = await loadNestedOfferingWithJoinsAndLinksForId(transaction, sourceOfferingId);
    const sourceOfferings = JSON.parse(sourceJsonString);

    if (!sourceOfferings || sourceOfferings.length === 0) {
      throw error(404, `Source offering ${sourceOfferingId} not found`);
    }

    const sourceOffering = sourceOfferings[0];

    // 2. Check if source is already a shop offering
    if (sourceOffering.wholesaler_id === 99) {
      throw error(400, "Cannot copy a shop offering to create another shop offering");
    }

    // 3. Create shop offering data (copy from source, set wholesaler_id = 99)
    const shopOfferingData: z.infer<typeof WholesalerItemOfferingForCreateSchema> = {
      wholesaler_id: 99, // Shop user
      category_id: sourceOffering.category_id,
      product_def_id: sourceOffering.product_def_id,
      sub_seller: sourceOffering.sub_seller,
      material_id: sourceOffering.material_id,
      form_id: sourceOffering.form_id,
      surface_finish_id: sourceOffering.surface_finish_id,
      construction_type_id: sourceOffering.construction_type_id,
      color_variant: sourceOffering.color_variant,
      title: sourceOffering.title,
      size: sourceOffering.size,
      dimensions: sourceOffering.dimensions,
      weight_grams: sourceOffering.weight_grams,
      price: sourceOffering.price,
      currency: sourceOffering.currency,
      comment: sourceOffering.comment ? `Copied from offering ${sourceOfferingId}: ${sourceOffering.comment}` : `Copied from offering ${sourceOfferingId}`,
      is_assortment: sourceOffering.is_assortment,
    };

    // 4. Validate and insert shop offering
    const validated = WholesalerItemOfferingForCreateSchema.parse(shopOfferingData);

    const insertRequest = transaction.request();
    insertRequest.input("wholesaler_id", validated.wholesaler_id);
    insertRequest.input("category_id", validated.category_id);
    insertRequest.input("product_def_id", validated.product_def_id);
    insertRequest.input("sub_seller", validated.sub_seller);
    insertRequest.input("material_id", validated.material_id);
    insertRequest.input("form_id", validated.form_id);
    insertRequest.input("surface_finish_id", validated.surface_finish_id);
    insertRequest.input("construction_type_id", validated.construction_type_id);
    insertRequest.input("color_variant", validated.color_variant);
    insertRequest.input("title", validated.title);
    insertRequest.input("size", validated.size);
    insertRequest.input("dimensions", validated.dimensions);
    insertRequest.input("weight_grams", validated.weight_grams);
    insertRequest.input("price", validated.price);
    insertRequest.input("currency", validated.currency);
    insertRequest.input("comment", validated.comment);
    insertRequest.input("is_assortment", validated.is_assortment);

    const insertResult = await insertRequest.query(`
      INSERT INTO dbo.wholesaler_item_offerings (
        wholesaler_id, category_id, product_def_id, sub_seller,
        material_id, form_id, surface_finish_id, construction_type_id, color_variant,
        title, size, dimensions, weight_grams, price, currency, comment, is_assortment
      )
      OUTPUT INSERTED.offering_id
      VALUES (
        @wholesaler_id, @category_id, @product_def_id, @sub_seller,
        @material_id, @form_id, @surface_finish_id, @construction_type_id, @color_variant,
        @title, @size, @dimensions, @weight_grams, @price, @currency, @comment, @is_assortment
      )
    `);

    const shopOfferingId = insertResult.recordset[0].offering_id;

    // 5. Link shop offering to source via shop_offering_sources
    const linkRequest = transaction.request();
    linkRequest.input("shop_offering_id", shopOfferingId);
    linkRequest.input("source_offering_id", sourceOfferingId);
    await linkRequest.query(`
      INSERT INTO dbo.shop_offering_sources (shop_offering_id, source_offering_id, priority)
      VALUES (@shop_offering_id, @source_offering_id, 0)
    `);

    await transaction.commit();

    log.info(`[${operationId}] Shop offering created and linked`, {
      shop_offering_id: shopOfferingId,
      source_offering_id: sourceOfferingId,
    });

    return json(
      {
        success: true,
        message: "Shop offering created successfully",
        data: { shop_offering_id: shopOfferingId },
        meta: { timestamp: new Date().toISOString() }
      },
      { status: 201 }
    );
  } catch (err) {
    await transaction.rollback();
    console.error("Failed to copy offering for shop:", err);
    log.error(`[${operationId}] Failed to copy offering for shop`, { error: String(err) });
    throw error(500, `Failed to copy offering for shop: ${err}`);
  }
};
