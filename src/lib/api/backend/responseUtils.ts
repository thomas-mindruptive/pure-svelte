import { json } from "@sveltejs/kit";
import type { DeleteConflictResponse, DeleteSuccessResponse } from "../api.types";
import type { DeleteCascadeBlockedError } from "$lib/backendQueries/entityOperations/entityErrors";
import type { DeleteResult } from "$lib/backendQueries/entityOperations/entityOpsResultTypes";

export function buildDeleteConflictResponse(
    message: string,
    hardDependencies: string[],
    softDependencies: string[],
    cascade_available: boolean) {

    const conflictResponse: DeleteConflictResponse<string[]> = {
        success: false,
        message,
        status_code: 409,
        error_code: "DEPENDENCY_CONFLICT",
        dependencies: { hard: hardDependencies, soft: softDependencies },
        cascade_available,
        meta: { timestamp: new Date().toISOString() },
    };
    return json(conflictResponse, { status: 409 });
}

export function buildDeleteConflictResponseFromError(message: string, err: DeleteCascadeBlockedError) {
  const response =  buildDeleteConflictResponse(message, err.hard, err.soft, err.cascadeAvailable);
  return response;
}

export function buildDeleteSuccessResponse<T>(
    message: string,
    hardDependencies: string[],
    softDependencies: string[],
    deleted_resource: T,
    cascade_performed: boolean
) {
    const response: DeleteSuccessResponse<T> = {
        success: true,
        message,
        data: {
          deleted_resource,
          cascade_performed,
          dependencies_cleared: hardDependencies.length + softDependencies.length,
        },
        meta: { timestamp: new Date().toISOString() },
      };
      return json(response, {status: 200});
}

export function buildDeleteSuccessResponseFromDeleteResult(message: string, deleteResult: DeleteResult<unknown>, cascade_performed: boolean) {
    const response = buildDeleteSuccessResponse (
        message,
        deleteResult.hardDependencies,
        deleteResult.softDependencies,
        deleteResult.deleted,
        cascade_performed
    )
    return response;
}
