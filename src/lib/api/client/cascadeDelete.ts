import { requestConfirmation, type ConfirmationOption } from "$lib/stores/confirmation";
import { addNotification } from "$lib/stores/notifications";
import { log } from "$lib/utils/logger";
import type { DeleteApiResponse, DeleteConflictResponse } from "../api.types";

export type ID = string | number;

export type DeleteApiFunction<TDomainClass> = (
  id: ID,
  cascade: boolean,
  forceCascade: boolean,
) => Promise<DeleteApiResponse<TDomainClass, string[]>>;

export async function cascadeDelte<TDomainClass>(
  ids: ID[],
  delFunc: DeleteApiFunction<TDomainClass>,
  info: { domainObjectName: string; softDepInfo: string; hardDepInfo: string },
  allowForceCascadingDelte = false,
): Promise<boolean> {
  let dataChanged = false;

  for (const id of ids) {
    const idAsNumber = Number(id);
    if (isNaN(idAsNumber)) {
      throw new Error(`Invalid id: ${id}`);
    }

    // Try regular delete first.
    const initialResult = await delFunc(id, false, false);

    // Success => Delete succeeded. -----------------------------------------------------------------------------------
    if (initialResult.success) {
      log.debug(`Delte successful`);
      addNotification(`Object deleted.`, "success");
      dataChanged = true;
    }
    // Delete unsuccessful but cascade_available or allowForceCascadingDelte ------------------------------------------
    else if (initialResult.cascade_available || allowForceCascadingDelte) {
      const softDepInfo = info.softDepInfo ? `\n${info.softDepInfo}` : "";
      const hardDepInfo = info.hardDepInfo ? `\n${info.hardDepInfo}` : "";
      const conflictRespone = initialResult as DeleteConflictResponse<string[]>;
      const dependencyCount = conflictRespone.dependencies.hard.length + conflictRespone.dependencies.soft.length;
      const confirmMessage =
        `${info.domainObjectName} has ${dependencyCount} dependencies.${softDepInfo}${hardDepInfo}` +
        `\n${JSON.stringify(initialResult.dependencies)}`;

      // Path "cascade_available"  ------------------------------------------------------------------------------------
      if (!allowForceCascadingDelte) {
        const confirmed = await requestConfirmation(confirmMessage, "Confirm Cascade Delete");

        // If use confirms cascade => Call API with respective param = true.
        if (confirmed.confirmed) {
          const cascadeResult = await delFunc(id, true, false);
          if (cascadeResult.success) {
            log.debug(`Cascade delete successful`);
            addNotification(`${info.domainObjectName} and its dependencies removed.`, "success");
            dataChanged = true;
          } else {
            log.debug(`Cascade delete NOT successful`, cascadeResult);
            addNotification(cascadeResult.message || `Could not delete ${info.domainObjectName}.`, "error", 5000);
          }
        } else {
          log.debug(`Dialog not confirmed or no forceCascade`);
          addNotification(`Could not delete ${info.domainObjectName} because cascade was not confirmed.`, "error", 5000);
        }
      }
      // Path "NO cascade_available" but allowForceCascadingDelte ---------------------------------------------------
      else {
        // If cascade_available is false (this usually means we have hard dependencies)
        // => User must confirm with extra layer of confirmation: Checkbox "Are you sure to force cascading delte?"
        const confirmed = await requestConfirmation(confirmMessage, "Confirm Cascade Delete", [
          { name: "forceCascade", description: "Are you sure to force cascading delte?" },
        ]);

        if (
          confirmed.confirmed &&
          confirmed.selectedOptions &&
          confirmed.selectedOptions.findIndex((value: ConfirmationOption) => value.name === "forceCascade") >= 0
        ) {
          const cascadeResult = await delFunc(id, true, true);
          if (cascadeResult.success) {
            log.debug(`Cascade delete successful`);
            addNotification(`${info.domainObjectName} and its dependencies removed.`, "success");
            dataChanged = true;
          } else {
            log.debug(`Cascade delete NOT successful`, cascadeResult);
            addNotification(cascadeResult.message || `Could not delete ${info.domainObjectName}.`, "error", 5000);
          }
        } else {
          log.debug(`Dialog not confirmed or no forceCascade`);
          addNotification(`Could not delete ${info.domainObjectName} because cascade was not confirmed.`, "error", 5000);
        }
      }
    }
  }

  return dataChanged;
}
