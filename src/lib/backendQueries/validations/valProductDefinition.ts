/**
 * Validation logic for ProductDefinition entities.
 *
 * Enforces business rules for product definitions, particularly preventing
 * changes that would create conflicts with existing offerings.
 */

import type { ProductDefinition } from "$lib/domain/domainTypes";
import type { ValidationResultFor } from "$lib/domain/domainTypes.utils";
import { log } from "$lib/utils/logger";
import type { Transaction } from "mssql";
import type { z } from "zod";

/**
 * Validates that Product Definition changes don't conflict with existing offerings.
 *
 * **Business Rule:**
 * When updating material_id/form_id/surface_finish_id/construction_type_id on a Product Definition,
 * we must ensure existing offerings won't become "orphaned" or conflicted.
 *
 * **Scenarios:**
 * 1. **Setting field from NULL → value:**
 *    - Check if offerings have DIFFERENT non-null values for this field
 *    - If yes → ERROR (offerings would be orphaned)
 *
 * 2. **Changing field from value A → value B:**
 *    - Check if offerings explicitly have value A set
 *    - If yes → ERROR (offerings would be orphaned)
 *
 * 3. **Setting field to NULL:**
 *    - Always OK (offerings can have their own values)
 *
 * @param productDef - The product definition data being updated (partial)
 * @param transaction - Database transaction for loading existing offerings
 * @returns ValidationResultFor indicating success or field-specific errors
 *
 * @example
 * // Existing Product Definition: material_id=NULL, form_id=2
 * // Existing Offerings:
 * //   - Offering 100: material_id=5 (Rose Quartz), form_id=NULL
 * //   - Offering 101: material_id=7 (Amethyst), form_id=NULL
 *
 * // ❌ Invalid: Try to set material_id=5
 * // Error: Offering 101 has material_id=7, would be orphaned
 *
 * // ✅ Valid: Change form_id from 2 to 3
 * // OK: No offerings have form_id set (they all inherit)
 */
export async function validateProductDefConstraints(
	productDef: Partial<ProductDefinition>,
	transaction: Transaction
): Promise<ValidationResultFor<z.ZodAny>> {
	log.debug("validateProductDefConstraints", { product_def_id: productDef.product_def_id });

	// Parameter guard: product_def_id is required for UPDATE validation
	// If missing, this indicates a programming error in the calling code
	if (!productDef.product_def_id) {
		log.error("validateProductDefConstraints called without product_def_id", { productDef });
		return {
			isValid: false,
			errors: {
				_system: ["PROGRAMMING ERROR: product_def_id is required for validateProductDefConstraints. This validation should only be called for UPDATE operations."]
			},
			sanitized: undefined
		};
	}

	try {
		// Check which constrained fields are being updated
		const constrainedFields: Array<keyof Pick<ProductDefinition, 'material_id' | 'form_id' | 'surface_finish_id' | 'construction_type_id'>> = [
			'material_id',
			'form_id',
			'surface_finish_id',
			'construction_type_id'
		];

		// Only validate fields that are actually being changed
		const fieldsToValidate = constrainedFields.filter(
			field => field in productDef && productDef[field] !== undefined
		);

		if (fieldsToValidate.length === 0) {
			// No constrained fields being updated
			return {
				isValid: true,
				errors: {},
				sanitized: productDef
			};
		}

		// Load current Product Definition state
		const currentResult = await transaction.request()
			.input("product_def_id", productDef.product_def_id)
			.query(`
				SELECT material_id, form_id, surface_finish_id, construction_type_id
				FROM dbo.product_definitions
				WHERE product_def_id = @product_def_id
			`);

		const currentProductDef = currentResult.recordset[0];

		if (!currentProductDef) {
			return {
				isValid: false,
				errors: {
					product_def_id: [`Product Definition with ID ${productDef.product_def_id} not found.`]
				},
				sanitized: undefined
			};
		}

		// Load all offerings for this Product Definition
		const offeringsResult = await transaction.request()
			.input("product_def_id", productDef.product_def_id)
			.query(`
				SELECT offering_id, material_id, form_id, surface_finish_id, construction_type_id, override_material
				FROM dbo.wholesaler_item_offerings
				WHERE product_def_id = @product_def_id
			`);

		const offerings = offeringsResult.recordset;

		if (offerings.length === 0) {
			// No offerings, no conflicts possible
			return {
				isValid: true,
				errors: {},
				sanitized: productDef
			};
		}

		const errors: Record<string, string[]> = {};

		// Validate each field being changed
		for (const field of fieldsToValidate) {
			const currentValue = currentProductDef[field];
			const newValue = productDef[field];

			// Skip if value isn't actually changing
			if (currentValue === newValue) {
				continue;
			}

			// If setting to NULL, always OK (offerings can have their own values)
			if (newValue === null) {
				continue;
			}

			// Check if any offerings have conflicting values
			const conflictingOfferings = offerings.filter(off => {
				const offeringValue = off[field];

				// Offering has no value set (inherits) → no conflict
				if (offeringValue === null || offeringValue === undefined) {
					return false;
				}

				// Offering has same value as new value → no conflict
				if (offeringValue === newValue) {
					return false;
				}

				// For material_id: If offering has override_material=true, it's allowed to have different value → no conflict
				if (field === 'material_id' && off.override_material === true) {
					return false;
				}

				// Offering has different value → CONFLICT
				return true;
			});

			if (conflictingOfferings.length > 0) {
				const offeringIds = conflictingOfferings.map(o => o.offering_id).join(', ');
				const conflictingValues = [...new Set(conflictingOfferings.map(o => o[field]))].join(', ');

				errors[field] = [`Cannot set ${field}=${newValue}. ${conflictingOfferings.length} offering(s) have conflicting values (${field} = ${conflictingValues}): offering_id ${offeringIds}`];

				log.warn(`Product Definition constraint violation`, {
					field,
					product_def_id: productDef.product_def_id,
					current_value: currentValue,
					new_value: newValue,
					conflicting_offering_ids: offeringIds
				});
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
			sanitized: productDef
		};

	} catch (dbError) {
		log.error("validateProductDefConstraints: Database error", { error: dbError });
		return {
			isValid: false,
			errors: {
				_system: [`Failed to validate product definition constraints: ${dbError instanceof Error ? dbError.message : String(dbError)}`]
			},
			sanitized: undefined
		};
	}
}
