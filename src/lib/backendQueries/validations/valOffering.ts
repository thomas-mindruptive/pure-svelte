/**
 * Validation logic for WholesalerItemOffering entities.
 *
 * Enforces business rules for offerings, particularly the constraint that
 * offerings cannot override material/form/surface/construction fields if they
 * are already set in the parent Product Definition.
 *
 * UNLESS override_material flag is set to TRUE (for material_id only).
 */

import type { WholesalerItemOffering } from "$lib/domain/domainTypes";
import type { ValidationResultFor } from "$lib/domain/domainTypes.utils";
import { log } from "$lib/utils/logger";
import type { Transaction } from "mssql";
import type { z } from "zod";

/**
 * Validates that an offering doesn't override constrained fields from its Product Definition.
 *
 * **Business Rule:**
 * If Product Definition has material_id/form_id/surface_finish_id/construction_type_id set,
 * the offering MUST either:
 * - Leave the field as NULL (inherits from Product Definition)
 * - Set the SAME value as Product Definition (redundant but allowed)
 * - Set override_material=TRUE to allow material_id override (material_id only)
 *
 * **NOT allowed:**
 * - Setting a DIFFERENT value (would create conflict) - unless override flag is set
 *
 * @param offering - The offering data being created/updated (partial for updates)
 * @param transaction - Database transaction for loading Product Definition
 * @returns ValidationResultFor indicating success or field-specific errors
 *
 * @example
 * // Product Definition: material_id=5 (Halbedelstein), form_id=2 (Sphere)
 *
 * // ✅ Valid: Offering inherits from Product Definition
 * { product_def_id: 10, material_id: null, form_id: null }
 *
 * // ✅ Valid: Offering explicitly sets same value
 * { product_def_id: 10, material_id: 5, form_id: 2 }
 *
 * // ✅ Valid: Offering overrides material with flag set
 * { product_def_id: 10, material_id: 7, override_material: true }
 *
 * // ❌ Invalid: Offering tries to override material without flag
 * { product_def_id: 10, material_id: 7, override_material: false }
 * // Error: "Cannot override material_id. Product Definition has material_id=5"
 */
export async function validateOfferingConstraints(
	offering: Partial<WholesalerItemOffering>,
	transaction: Transaction
): Promise<ValidationResultFor<z.ZodAny>> {
	log.debug("validateOfferingConstraints", { offering_id: offering.offering_id, product_def_id: offering.product_def_id });

	// Parameter guard: product_def_id is required for constraint validation
	// If missing, this indicates either a programming error or schema validation failure
	if (!offering.product_def_id) {
		log.error("validateOfferingConstraints called without product_def_id", { offering });
		return {
			isValid: false,
			errors: {
				product_def_id: ["PROGRAMMING ERROR: product_def_id is required. This should have been caught by schema validation."]
			},
			sanitized: undefined
		};
	}

	try {
		// Load Product Definition to check for constrained fields
		const result = await transaction.request()
			.input("product_def_id", offering.product_def_id)
			.query(`
				SELECT material_id, form_id, surface_finish_id, construction_type_id
				FROM dbo.product_definitions
				WHERE product_def_id = @product_def_id
			`);

		const productDef = result.recordset[0];

		if (!productDef) {
			return {
				isValid: false,
				errors: {
					product_def_id: [`Product Definition with ID ${offering.product_def_id} not found.`]
				},
				sanitized: undefined
			};
		}

		const errors: Record<string, string[]> = {};

		// Check each constrained field
		const constrainedFields: Array<keyof Pick<WholesalerItemOffering, 'material_id' | 'form_id' | 'surface_finish_id' | 'construction_type_id'>> = [
			'material_id',
			'form_id',
			'surface_finish_id',
			'construction_type_id'
		];

		for (const field of constrainedFields) {
			const prodDefValue = productDef[field];
			const offeringValue = offering[field];

			// Rule: If Product Definition has value AND offering has DIFFERENT value → ERROR
			// UNLESS override_material flag is set (for material_id only)
			if (prodDefValue !== null && prodDefValue !== undefined) {
				if (offeringValue !== null && offeringValue !== undefined && offeringValue !== prodDefValue) {
					// Check if override is allowed for this specific field
					const overrideAllowed = field === 'material_id' && offering.override_material === true;

					if (!overrideAllowed) {
						errors[field] = [`Cannot override ${field}. Product Definition already has ${field}=${prodDefValue}.`];
						log.warn(`Offering constraint violation`, {
							field,
							product_def_id: offering.product_def_id,
							product_def_value: prodDefValue,
							offering_value: offeringValue
						});
					} else {
						log.info(`Override allowed for ${field}`, {
							field,
							product_def_id: offering.product_def_id,
							product_def_value: prodDefValue,
							offering_value: offeringValue,
							override_flag: offering.override_material
						});
					}
				}
			}
		}

		if (Object.keys(errors).length > 0) {
			return {
				isValid: false,
				errors,
				sanitized: undefined
			};
		}

		return {
			isValid: true,
			errors: {},
			sanitized: offering
		};

	} catch (dbError) {
		log.error("validateOfferingConstraints: Database error", { error: dbError });
		return {
			isValid: false,
			errors: {
				_system: [`Failed to validate offering constraints: ${dbError instanceof Error ? dbError.message : String(dbError)}`]
			},
			sanitized: undefined
		};
	}
}
