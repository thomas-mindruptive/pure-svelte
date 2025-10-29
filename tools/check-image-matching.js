import { db } from "./dist/src/lib/backendQueries/db.js";

async function checkImageMatching() {
  const pool = await db;

  console.log("\n=== PROBLEM ANALYSE ===");

  // Check wie viele Offerings pro product_def
  const offeringsPerProduct = await pool.request().query(`
    SELECT
      pd.product_def_id,
      pd.title,
      COUNT(wio.offering_id) as offering_count,
      COUNT(DISTINCT pdi.image_id) as image_count
    FROM dbo.product_definitions pd
    LEFT JOIN dbo.wholesaler_item_offerings wio ON pd.product_def_id = wio.product_def_id
    LEFT JOIN dbo.product_definition_images pdi ON pd.product_def_id = pdi.product_def_id
    GROUP BY pd.product_def_id, pd.title
    HAVING COUNT(wio.offering_id) > 0
    ORDER BY COUNT(DISTINCT pdi.image_id) DESC, pd.product_def_id
  `);

  console.log("\nProducts with offerings and their images:");
  offeringsPerProduct.recordset.slice(0, 10).forEach(p => {
    console.log(`  Product ${p.product_def_id}: "${p.title}"`);
    console.log(`    - ${p.offering_count} offerings, ${p.image_count} images`);
  });

  // Check was das matching system macht
  console.log("\n=== IMAGE MATCHING PROBLEM ===");
  const result = await pool.request().query(`
    SELECT TOP 5
      wio.offering_id,
      wio.title as offering_title,
      wio.product_def_id,
      pd.title as product_title,
      wio.material_id as offering_material,
      wio.form_id as offering_form
    FROM dbo.wholesaler_item_offerings wio
    JOIN dbo.product_definitions pd ON wio.product_def_id = pd.product_def_id
    WHERE pd.product_def_id != 44  -- NOT Halskette gefädelt
    ORDER BY wio.offering_id
  `);

  console.log("\nFirst 5 offerings that are NOT 'Halskette gefädelt':");
  result.recordset.forEach(o => {
    console.log(`\nOffering ${o.offering_id}: "${o.offering_title}"`);
    console.log(`  Product: ${o.product_def_id} - "${o.product_title}"`);
    console.log(`  Material: ${o.offering_material}, Form: ${o.offering_form}`);
    console.log(`  → Script würde FÄLSCHLICHERWEISE die 3 Halskette-Bilder als Fallback nutzen!`);
  });

  console.log("\n=== DAS IST DAS PROBLEM ===");
  console.log("Die 3 Bilder von 'Halskette gefädelt' haben NULL für material_id und form_id.");
  console.log("Deshalb werden sie als 'generische' Bilder für ALLE anderen Produkte verwendet!");
  console.log("Das ist FALSCH - sie gehören NUR zu Product 44!");

  await pool.close();
}

checkImageMatching().catch(console.error);