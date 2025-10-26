// File: src/lib/backendQueries/entityOperations.ts

import type { ApiErrorResponse, ApiSuccessResponse, HttpStatusCode } from "$lib/api/api.types";
import { db } from "$lib/backendQueries/db";
import { mssqlErrorMapper } from "$lib/backendQueries/mssqlErrorMapper";
import { validateEntityBySchema, type EntityValidationFunc } from "$lib/domain/domainTypes.utils";
import { coerceErrorMessage } from "$lib/utils/errorUtils";
import { log } from "$lib/utils/logger";
import { json } from "@sveltejs/kit";
import { type z } from "zod";

type BrandedSchema = z.ZodObject<z.ZodRawShape> & { __brandMeta?: { tableName: string; dbSchema: string } };

/**
 * [CORE DB] Inserts a pre-validated entity record.
 */
async function insertRecord<S extends BrandedSchema>(schema: S, data: z.output<S>): Promise<Record<string, unknown>> {
  log.debug(`insertRecord`);

  const meta = schema.__brandMeta!;
  if (!meta) {
    throw new Error(`Metadata is missing from ${schema.description}`);
  }
  log.debug(``, { meta });
  const fullTableName = `${meta.dbSchema}.${meta.tableName}`;
  log.debug(``, { fullTableName });
  const keys = Object.keys(data);
  log.debug(``, { keys });

  const sql = `INSERT INTO ${fullTableName} (${keys.join(", ")}) OUTPUT INSERTED.* VALUES (${keys.map((k) => `@${k}`).join(", ")});`;

  try {
    const request = db.request();
    for (const key of keys) {
      request.input(key, (data as Record<string, unknown>)[key]);
    }
    const result = await request.query(sql);
    if (!result.recordset?.[0]) {
      throw new Error("Database did not return the created record.");
    }
    return result.recordset[0];
  } catch (dbError) {
    log.error(`[CORE DB] Insert failed for ${fullTableName}`, { error: dbError });
    throw dbError;
  }
}

/**
 * [CORE DB] Updates a pre-validated entity record. Returns null if not found.
 */
async function updateRecord<S extends BrandedSchema>(
  schema: S,
  id: number | string,
  idColumn: keyof z.infer<S> & string,
  data: Partial<z.output<S>>,
): Promise<Record<string, unknown> | null> {
  log.debug(`updateRecord`, { id, idColumn });

  const meta = schema.__brandMeta!;
  if (!meta) {
    throw new Error(`Metadata is missing from ${schema.description}`);
  }
  const fullTableName = `${meta.dbSchema}.${meta.tableName}`;
  // Filter out the ID column to prevent updating identity columns
  const keys = Object.keys(data).filter((k) => k !== idColumn);

  if (keys.length === 0) {
    throw new Error(`No fields to update for ${fullTableName} (ID column was the only field provided)`);
  }

  const sql = `UPDATE ${fullTableName} SET ${keys.map((k) => `${k} = @${k}`).join(", ")} OUTPUT INSERTED.* WHERE ${idColumn} = @id;`;

  try {
    const request = db.request();
    for (const key of keys) {
      request.input(key, (data as Record<string, unknown>)[key]);
    }
    request.input("id", id);
    const result = await request.query(sql);
    return result.recordset?.[0] || null;
  } catch (dbError) {
    log.error(`[CORE DB] Update failed for ${fullTableName}`, { error: dbError });
    throw dbError;
  }
}

/**
 * Validate data through the schema and additionalValidation. 
 * Ceate entity and return a complete SvelteKit `Response`.
 * This function orchestrates the entire process for a POST endpoint.
 * 
 * @param additionalValidation - Function to validate the entity beyonf the schema validation, 
 *    e.g. cross-entity data consistencies.
 */
export async function validateAndInsertEntity(
  schemaForCreate: BrandedSchema,
  rawData: unknown,
  successDataWrapperKey: string,
  additionalValidation?: EntityValidationFunc<typeof schemaForCreate>
): Promise<Response> {
  const entityName = schemaForCreate.description || "entity";
  log.debug(`validateAndInsertEntity`, { entityName, successDataWrapperKey });

  const validation = validateEntityBySchema(schemaForCreate, rawData);
  if (!validation.isValid) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      message: "Server validation failed.",
      status_code: 400,
      error_code: "VALIDATION_ERROR",
      errors: validation.errors,
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errorResponse, { status: 400 });
  }

  try {
    const newRecord = await insertRecord(schemaForCreate, validation.sanitized);
    const successResponse: ApiSuccessResponse<Record<string, unknown>> = {
      success: true,
      message: `${entityName} created successfully.`,
      data: { [successDataWrapperKey]: newRecord },
      meta: { timestamp: new Date().toISOString() },
    };
    return json(successResponse, { status: 201 });
  } catch (dbError) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(dbError);
    const errorResponse: ApiErrorResponse = {
      success: false,
      message: message,
      status_code: status as HttpStatusCode,
      error_code: "DATABASE_ERROR",
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errorResponse, { status });
  }
}

/**
 * Validate data through schema and additionalValidation.
 * Updates entity and return a complete SvelteKit `Response`.
 * This function orchestrates the entire process for a PUT endpoint.
 * 
 * @param additionalValidation - Function to validate the entity beyonf the schema validation, 
 *    e.g. cross-entity data consistencies.
 */
export async function validateAndUpdateEntity<S extends BrandedSchema>(
  schema: S,
  id: number | string,
  idColumn: keyof z.infer<S> & string,
  rawData: unknown,
  successDataWrapperKey: string,
  additionalValidation?: EntityValidationFunc<z.infer<S>>,
): Promise<Response> {
  const entityName = schema.description || "entity";
  log.debug(`validateAndUpdateEntity`, { entityName, successDataWrapperKey });

  const validation = validateEntityBySchema(schema.partial(), rawData);
  if (!validation.isValid) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      message: "Server validation failed.",
      status_code: 400,
      error_code: "VALIDATION_ERROR",
      errors: validation.errors,
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errorResponse, { status: 400 });
  }

  if (Object.keys(validation.sanitized).length === 0) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      message: "Request body must contain at least one field to update.",
      status_code: 400,
      error_code: "VALIDATION_ERROR",
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errorResponse, { status: 400 });
  }

  try {
    const updatedRecord = await updateRecord(schema, id, idColumn, validation.sanitized as Partial<z.output<S>>);

    if (!updatedRecord) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        message: `${entityName} with ID ${id} not found.`,
        status_code: 404,
        error_code: "NOT_FOUND",
        meta: { timestamp: new Date().toISOString() },
      };
      return json(errorResponse, { status: 404 });
    }

    const successResponse: ApiSuccessResponse<Record<string, unknown>> = {
      success: true,
      message: `${entityName} updated successfully.`,
      data: { [successDataWrapperKey]: updatedRecord },
      meta: { timestamp: new Date().toISOString() },
    };
    return json(successResponse, { status: 200 });
  } catch (dbError) {
    const { status, message } = mssqlErrorMapper.mapToHttpError(dbError);
    const errorResponse: ApiErrorResponse = {
      success: false,
      message: message,
      status_code: status as HttpStatusCode,
      error_code: "DATABASE_ERROR",
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errorResponse, { status });
  }
}

/**
 * Validate that ID param is a valid number.
 * @param aId
 * @returns id or error
 */
export function validateIdUrlParam(
  idParam: string | undefined,
): { id: number; errorResponse: undefined } | { id: undefined; errorResponse: Response } {
  const id = parseInt(idParam || "", 10);

  if (isNaN(id) || id <= 0) {
    const errRes: ApiErrorResponse = {
      success: false,
      message: "validateIdUrlParam: Invalid or missing ID in the URL.",
      status_code: 400,
      error_code: "BAD_REQUEST",
      meta: { timestamp: new Date().toISOString() },
    };
    log.warn(`Invalid ID provided in URL parameter.`, { id: idParam });
    return { id: undefined, errorResponse: json(errRes, { status: 400 }) };
  }

  return { id: id, errorResponse: undefined };
}

/**
 * Build ApiErrorResponse for unexpected errors with smart SQL error mapping.
 * Attempts to map SQL errors to appropriate HTTP status codes, falls back to 500.
 * @param err
 * @param info
 * @returns
 */
export function buildUnexpectedError(err: unknown, info?: string) {
  // Versuche zuerst DB-spezifisches Mapping
  const { status, message } = mssqlErrorMapper.mapToHttpError(err);

  if (status !== 500) {
    // Das ist ein DB-spezifischer Fehler (409, 400, 404, etc.)
    const errorMsg = coerceErrorMessage(err);
    const additionalInfo = info ? ` - ${info}` : "";
    log.error(`Database error occurred ${additionalInfo}`, { errorMsg });

    const errorResponse: ApiErrorResponse = {
      success: false,
      message: `${message}\n${errorMsg}`, // User-friendly DB message
      status_code: status as HttpStatusCode,
      error_code:
        status === 400
          ? "BAD_REQUEST"
          : status === 404
            ? "NOT_FOUND"
            : status === 409
              ? "CONFLICT"
              : status === 422
                ? "VALIDATION_ERROR"
                : "DATABASE_ERROR",
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errorResponse, { status });
  } else {
    // Generischer unerwarteter Fehler (JSON parse error, network, etc.)
    const errorMsg = coerceErrorMessage(err);
    //const additionalInfo = info ? ` - ${info}` : "";
    const msg = `An unexpected error occurred:\n${info}\n${errorMsg}`;
    log.error(msg, { errorMsg });

    const errorResponse: ApiErrorResponse = {
      success: false,
      message: msg,
      status_code: 500,
      error_code: "INTERNAL_SERVER_ERROR",
      meta: { timestamp: new Date().toISOString() },
    };
    return json(errorResponse, { status: 500 });
  }
}
