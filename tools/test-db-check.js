import { db } from "./dist/src/lib/backendQueries/db.js";

async function checkDatabase() {
  const pool = await db;

  console.log("\n=== CHECKING IMAGES TABLE ===");
  const imagesResult = await pool.request().query(`
    SELECT COUNT(*) as total_images,
           COUNT(DISTINCT filename) as unique_filenames
    FROM dbo.images
  `);
  console.log("Total images:", imagesResult.recordset[0]);

  console.log("\n=== CHECKING PRODUCT DEFINITION IMAGES ===");
  const pdiResult = await pool.request().query(`
    SELECT COUNT(*) as total_pdi,
           COUNT(DISTINCT image_id) as unique_images,
           COUNT(DISTINCT product_def_id) as unique_products
    FROM dbo.product_definition_images
  `);
  console.log("Product definition images:", pdiResult.recordset[0]);

  console.log("\n=== CHECKING SPECIFIC IMAGES ===");
  const specificImages = await pool.request().query(`
    SELECT TOP 10
      img.image_id,
      img.filename,
      img.filepath,
      COUNT(pdi.product_def_id) as used_in_products
    FROM dbo.images img
    LEFT JOIN dbo.product_definition_images pdi ON img.image_id = pdi.image_id
    GROUP BY img.image_id, img.filename, img.filepath
    ORDER BY img.image_id
  `);
  console.log("First 10 images:");
  specificImages.recordset.forEach(img => {
    console.log(`  ID ${img.image_id}: ${img.filename} (used in ${img.used_in_products} products)`);
  });

  console.log("\n=== CHECKING HALSKETTE PRODUCTS ===");
  const halsketteResult = await pool.request().query(`
    SELECT TOP 10
      pd.product_def_id,
      pd.title,
      pd.description,
      COUNT(pdi.image_id) as image_count
    FROM dbo.product_definitions pd
    LEFT JOIN dbo.product_definition_images pdi ON pd.product_def_id = pdi.product_def_id
    WHERE pd.title LIKE '%Halskette%' OR pd.description LIKE '%Halskette%'
    GROUP BY pd.product_def_id, pd.title, pd.description
    ORDER BY pd.product_def_id
  `);
  console.log("Halskette products:");
  halsketteResult.recordset.forEach(prod => {
    console.log(`  ID ${prod.product_def_id}: ${prod.title} (${prod.image_count} images)`);
  });

  console.log("\n=== CHECKING OFFERINGS WITHOUT PRODUCT_DEF ===");
  const offeringsCheck = await pool.request().query(`
    SELECT COUNT(*) as total_offerings,
           COUNT(product_def_id) as with_product_def,
           COUNT(*) - COUNT(product_def_id) as without_product_def
    FROM dbo.wholesaler_item_offerings
  `);
  console.log("Offerings:", offeringsCheck.recordset[0]);

  console.log("\n=== CHECKING IMAGE ASSIGNMENTS ===");
  const assignments = await pool.request().query(`
    SELECT TOP 5
      pdi.product_def_id,
      pd.title as product_title,
      pdi.image_id,
      img.filename,
      pdi.material_id,
      pdi.form_id
    FROM dbo.product_definition_images pdi
    JOIN dbo.product_definitions pd ON pdi.product_def_id = pd.product_def_id
    JOIN dbo.images img ON pdi.image_id = img.image_id
    ORDER BY pdi.image_id, pdi.product_def_id
  `);
  console.log("\nFirst 5 image assignments:");
  assignments.recordset.forEach(a => {
    console.log(`  Product ${a.product_def_id} (${a.product_title}): Image ${a.image_id} (${a.filename})`);
    console.log(`    Material: ${a.material_id}, Form: ${a.form_id}`);
  });

  await pool.close();
}

checkDatabase().catch(console.error);