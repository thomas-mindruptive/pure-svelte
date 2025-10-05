import { requestConfirmation } from "$lib/stores/confirmation";
import { addNotification } from "$lib/stores/notifications";
import { log } from "$lib/utils/logger";
import { isDeleteConflict, type DeleteApiResponse, type DeleteConflictResponse } from "../api.types";

// ===== TYPES =====================================================================================

export type ID = number;
export type CompositeID = { parent1Id: ID; parent2Id: ID };

/**
 * Defines the signature for an API function that deletes a master data entity.
 * @example supplierApi.deleteSupplier
 */
export type DeleteApiFunction<TDeletedResource> = (
  id: ID,
  cascade: boolean,
  forceCascade: boolean,
) => Promise<DeleteApiResponse<TDeletedResource, string[]>>;

/**
 * Defines the signature for an API function that removes an n:m assignment.
 * It now correctly includes the forceCascade parameter to match the master delete pattern.
 * @example supplierApi.removeCategoryFromSupplier
 */
export type RemoveAssignmentApiFunction<TDeletedResource> = (
  parent1Id: ID,
  parent2Id: ID,
  cascade: boolean,
  forceCascade: boolean,
) => Promise<DeleteApiResponse<TDeletedResource, string[]>>;

/**
 * Shared configuration for user-facing dialog messages.
 */
export type DeletionDialogInfo = {
  domainObjectName: string;
  softDepInfo: string;
  hardDepInfo: string;
};

// ===== INTERNAL CORE FUNCTION ====================================================================

/**
 * Internal core function to handle the user confirmation workflow for any deletion conflict.
 * It is agnostic to the specific API call that needs to be made upon confirmation.
 * @returns true if the user confirmed and the subsequent action was successful, otherwise false.
 */
async function _handleDeletionConflict<TDeletedResource>(
  conflictResponse: DeleteConflictResponse<string[]>,
  info: DeletionDialogInfo,
  allowForceCascadingDelete: boolean,
  onConfirmCascade: (forceCascade: boolean) => Promise<DeleteApiResponse<TDeletedResource, string[]>>,
): Promise<boolean> {
  const softDepInfo = info.softDepInfo && conflictResponse.dependencies.soft.length ? `\n${info.softDepInfo}` : "";
  const hardDepInfo = info.hardDepInfo && conflictResponse.dependencies.hard.length > 0 ? `\n${info.hardDepInfo}` : "";
  const dependencyCount = conflictResponse.dependencies.hard.length + conflictResponse.dependencies.soft.length;
  const confirmMessage =
    `${info.domainObjectName} has ${dependencyCount} dependencies.${softDepInfo}${hardDepInfo}` +
    `\nDependencies:\n` +
    `hard: ${JSON.stringify(conflictResponse.dependencies.hard, null, 2)}\n` +
    `soft: ${JSON.stringify(conflictResponse.dependencies.soft, null, 2)}`;

  // --- Path 1: Soft dependencies, cascade is available ---
  if (conflictResponse.cascade_available) {
    log.debug(`Deletion conflict: Cascade is available. Requesting confirmation.`);
    const confirmed = await requestConfirmation(confirmMessage, "Confirm Cascade Delete");

    if (confirmed.confirmed) {
      const cascadeResult = await onConfirmCascade(false); // force = false
      if (cascadeResult.success) {
        addNotification(`${info.domainObjectName} and its dependencies were removed.`, "success");
        return true;
      } else {
        addNotification(cascadeResult.message || `Could not delete ${info.domainObjectName}.`, "error", 5000);
      }
    }
  }
  // --- Path 2: Hard dependencies, but force cascade is allowed by the client ---
  else if (allowForceCascadingDelete) {
    log.debug(`Deletion conflict: Cascade NOT available. Requesting FORCE confirmation.`);
    const confirmed = await requestConfirmation(confirmMessage, "Confirm FORCE Cascade Delete", [
      {
        name: "forceCascade",
        description: "I understand this is a destructive action and I want to force the deletion of all related data.",
      },
    ]);

    const forceConfirmed = confirmed.confirmed && confirmed.selectedOptions?.some((o) => o.name === "forceCascade");

    if (forceConfirmed) {
      const cascadeResult = await onConfirmCascade(true); // force = true
      if (cascadeResult.success) {
        addNotification(`${info.domainObjectName} and its hard dependencies were removed.`, "success");
        return true;
      } else {
        addNotification(cascadeResult.message || `Could not force delete ${info.domainObjectName}.`, "error", 5000);
      }
    }
  }
  // --- Path 3: Unhandled conflict ---
  else {
    addNotification(`Could not delete ${info.domainObjectName}. It has hard dependencies and force cascade is not enabled.`, "error", 5000);
  }

  return false;
}

// ===== PUBLIC HELPERS ==========================================================================

/**
 * Handles the cascading delete workflow for MASTER DATA ENTITIES.
 * @param ids Array of entity IDs to delete.
 * @param delFunc The API function to call for deletion (e.g., `supplierApi.deleteSupplier`).
 * @param info User-facing messages for the confirmation dialog.
 * @param allowForceCascadingDelete Set to true if the UI should allow forcing deletion of hard dependencies.
 * @returns A promise that resolves to true if any data was changed on the server.
 */
export async function cascadeDelete<TDeletedResource>(
  ids: ID[],
  delFunc: DeleteApiFunction<TDeletedResource>,
  info: DeletionDialogInfo,
  allowForceCascadingDelete = false,
): Promise<boolean> {
  let dataChanged = false;

  for (const id of ids) {
    const initialResult = await delFunc(id, false, false);

    if (initialResult.success) {
      addNotification(`${info.domainObjectName} deleted successfully.`, "success");
      dataChanged = true;
    }
    else if (isDeleteConflict(initialResult)) {
      const confirmedAndDeleted = await _handleDeletionConflict(
        initialResult,
        info,
        allowForceCascadingDelete,
        (force) => delFunc(id, true, force), // This is the onConfirm callback
      );
      if (confirmedAndDeleted) {
        dataChanged = true;
      }
    } else {
      addNotification(initialResult.message || `Could not delete ${info.domainObjectName}.`, "error", 5000);
    }
  }

  return dataChanged;
}

/**
 * Handles the cascading delete workflow for N:M ASSIGNMENTS.
 * @param compositeIds Array of composite IDs to identify the assignments to delete.
 * @param removeFunc The API function to call for removal (e.g., `supplierApi.removeCategoryFromSupplier`).
 * @param info User-facing messages for the confirmation dialog.
 * @param allowForceCascadingDelete Set to true if the UI should allow forcing deletion of hard dependencies.
 * @returns A promise that resolves to true if any data was changed on the server.
 */
export async function cascadeDeleteAssignments<TDeletedResource>(
  compositeIds: CompositeID[],
  removeFunc: RemoveAssignmentApiFunction<TDeletedResource>,
  info: DeletionDialogInfo,
  allowForceCascadingDelete = false,
): Promise<boolean> {
  let dataChanged = false;

  for (const idPair of compositeIds) {
    // Initial call is always non-cascading.
    const initialResult = await removeFunc(idPair.parent1Id, idPair.parent2Id, false, false);

    if (initialResult.success) {
      addNotification(`${info.domainObjectName} assignment removed successfully.`, "success");
      dataChanged = true;
    } else if (isDeleteConflict(initialResult)) {
      const confirmedAndDeleted = await _handleDeletionConflict(initialResult, info, allowForceCascadingDelete, (forceCascade) =>
        removeFunc(idPair.parent1Id, idPair.parent2Id, true, forceCascade),
      );
      if (confirmedAndDeleted) {
        dataChanged = true;
      }
    } else {
      addNotification(initialResult.message || `Could not remove ${info.domainObjectName} assignment.`, "error", 5000);
    }
  }

  return dataChanged;
}
