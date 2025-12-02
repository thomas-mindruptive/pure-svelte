/**
 * Delete blocked by dependencies.
 */
export class DeleteCascadeBlockedError extends Error {
    constructor(
      public readonly hard: string[],
      public readonly soft: string[],
      public readonly cascadeAvailable: boolean
    ) {
      super("Deletion blocked by dependencies");
    }
  }
  