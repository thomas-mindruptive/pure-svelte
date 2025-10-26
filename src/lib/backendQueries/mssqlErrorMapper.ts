// src/lib/server/errors/mssqlErrorMapper.ts

/**
 * MSSQL Error Mapper - Database Error to HTTP Status Translation
 * 
 * @description Maps MSSQL-specific error codes to appropriate HTTP status codes
 * and user-friendly error messages. This eliminates the need for application-level
 * constraint checking and provides consistent error handling across all APIs.
 * 
 * @features
 * - MSSQL error code to HTTP status mapping
 * - Constraint violation message extraction
 * - User-friendly error message generation
 * - Type-safe error handling
 * 
 * @architecture
 * - Implements generic DbErrorMapper interface for DB-agnostic APIs
 * - Uses MSSQL-specific error codes and message formats
 * - Provides fallback handling for unknown errors
 * 
 * @example
 * ```typescript
 * try {
 *   await db.query("INSERT INTO wholesalers...");
 * } catch (dbError) {
 *   const { status, message } = mssqlErrorMapper.mapToHttpError(dbError);
 *   throw error(status, message);
 * }
 * ```
 */

import { coerceErrorMessage } from '$lib/utils/errorUtils';
import { log } from '$lib/utils/logger';

/**
 * Generic database error mapper interface
 * Allows for different database implementations while keeping API code DB-agnostic
 */
export interface DbErrorMapper {
  /**
   * Maps a database error to HTTP status and message
   * @param error - Database error object (DB-specific format)
   * @returns Object with HTTP status code and original database error message
   */
  mapToHttpError(error: unknown): { status: number; message: string };
}

/**
 * MSSQL-specific error codes from Microsoft SQL Server
 * @see https://docs.microsoft.com/en-us/sql/relational-databases/errors-events/database-engine-events-and-errors
 */
const MSSQL_ERROR_CODES = {
  /** Unique index violation (composite or single column) */
  UNIQUE_INDEX_VIOLATION: 2601,
  /** Unique constraint or primary key violation */
  UNIQUE_CONSTRAINT_VIOLATION: 2627,
  /** Primary key violation (same as unique constraint) */
  PRIMARY_KEY_VIOLATION: 2627,
  /** Check constraint violation */
  CHECK_CONSTRAINT_VIOLATION: 547,
  /** Foreign key constraint violation */
  FOREIGN_KEY_VIOLATION: 547,
  /** NOT NULL constraint violation */
  NOT_NULL_VIOLATION: 515,
  /** Invalid column name */
  INVALID_COLUMN_NAME: 207,
  /** Invalid object name (table doesn't exist) */
  INVALID_OBJECT_NAME: 208,
  /** Permission denied */
  PERMISSION_DENIED: 229,
  /** Login failed */
  LOGIN_FAILED: 18456,
  /** Timeout expired */
  TIMEOUT_EXPIRED: -2,
  /** String or binary data would be truncated */
  STRING_TRUNCATION: 8152,
} as const;

/**
 * MSSQL Error object structure (from mssql npm package)
 * This represents the error object thrown by the mssql driver
 */
interface MssqlError {
  /** MSSQL error number */
  number: number;
  /** Error severity level */
  severity?: number;
  /** Error state */
  state?: number;
  /** Error procedure name (if from stored procedure) */
  procedure?: string;
  /** Line number where error occurred */
  lineNumber?: number;
  /** Error message from SQL Server */
  message: string;
  /** Original error name */
  name?: string;
  /** Server name where error occurred */
  serverName?: string;
  /** Additional error info */
  originalError?: unknown;
}

/**
 * MSSQL Error Mapper Implementation
 *
 * @description Handles MSSQL-specific error codes and translates them to HTTP responses.
 * Returns the original database error message for transparency and debugging.
 */
export class MssqlErrorMapper implements DbErrorMapper {

  /**
   * Type guard to check if an error is an MSSQL error
   * @param error - Unknown error object
   * @returns True if error is from MSSQL driver
   */
  private isMssqlError(error: unknown): error is MssqlError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'number' in error &&
      typeof (error as { number: unknown }).number === 'number' &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string'
    );
  }

  /**
   * Maps MSSQL database errors to appropriate HTTP status codes and messages
   *
   * @param error - Unknown error object (potentially from MSSQL)
   * @returns Object with HTTP status code and original database error message
   *
   * @httpStatusCodes
   * - 400: Bad Request (constraint violations, invalid data)
   * - 401: Unauthorized (authentication failures)
   * - 403: Forbidden (permission denied)
   * - 404: Not Found (invalid table/column names)
   * - 409: Conflict (unique constraint violations, FK violations)
   * - 422: Unprocessable Entity (data truncation)
   * - 500: Internal Server Error (unknown database errors)
   * - 503: Service Unavailable (timeout, connection issues)
   */
  public mapToHttpError(error: unknown): { status: number; message: string } {
    // Handle non-MSSQL errors
    if (!this.isMssqlError(error)) {
      log.warn("Non-MSSQL error encountered in MssqlErrorMapper", { error });

      if (error instanceof Error) {
        return {
          status: 500,
          message: error.message
        };
      }

      return {
        status: 500,
        message: coerceErrorMessage(error)
      };
    }

    // Log the original MSSQL error for debugging
    log.info("Mapping MSSQL error to HTTP response", {
      errorNumber: error.number,
      severity: error.severity,
      state: error.state,
      procedure: error.procedure,
      message: error.message
    });

    // Map MSSQL error codes to HTTP responses
    switch (error.number) {
      case MSSQL_ERROR_CODES.UNIQUE_INDEX_VIOLATION:
      case MSSQL_ERROR_CODES.UNIQUE_CONSTRAINT_VIOLATION:
      case MSSQL_ERROR_CODES.PRIMARY_KEY_VIOLATION:
        return {
          status: 409,
          message: error.message
        };

      case MSSQL_ERROR_CODES.CHECK_CONSTRAINT_VIOLATION:
      case MSSQL_ERROR_CODES.FOREIGN_KEY_VIOLATION:
        // Error 547 can be CHECK or FK constraint - return original message
        return {
          status: 409,
          message: error.message
        };

      case MSSQL_ERROR_CODES.NOT_NULL_VIOLATION:
        return {
          status: 400,
          message: error.message
        };

      case MSSQL_ERROR_CODES.STRING_TRUNCATION:
        return {
          status: 422,
          message: error.message
        };

      case MSSQL_ERROR_CODES.INVALID_COLUMN_NAME:
      case MSSQL_ERROR_CODES.INVALID_OBJECT_NAME:
        return {
          status: 404,
          message: error.message
        };

      case MSSQL_ERROR_CODES.PERMISSION_DENIED:
        return {
          status: 403,
          message: error.message
        };

      case MSSQL_ERROR_CODES.LOGIN_FAILED:
        return {
          status: 401,
          message: error.message
        };

      case MSSQL_ERROR_CODES.TIMEOUT_EXPIRED:
        return {
          status: 503,
          message: error.message
        };

      default:
        // Log unknown MSSQL errors for future handling
        log.warn("Unknown MSSQL error code encountered", {
          errorNumber: error.number,
          message: error.message,
          severity: error.severity
        });

        return {
          status: 500,
          message: error.message
        };
    }
  }
}

/**
 * Singleton instance of MSSQL error mapper
 * Export this for use across all API endpoints
 */
export const mssqlErrorMapper = new MssqlErrorMapper();