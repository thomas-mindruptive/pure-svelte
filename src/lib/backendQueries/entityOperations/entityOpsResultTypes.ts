/**
 * Standard return type for delete operations.
 * @template T - The type of the deleted entity data (e.g., { offering_image_id: number })
 */
export type DeleteResult<T> = {
    /** Relevant data of the deleted entity (for response/logging) */
    deleted: T;
    /** Stats about cascaded deletions (e.g., { deletedImages: 1, total: 1 }) */
    stats: Record<string, number>;
    hardDependencies: string[],
    softDependencies: string[],
};

/**
* Standard return type for cascade delete operations.
* @template T - The type of the deleted entity data (e.g., { offering_image_id: number })
*/
export type CascadeDeleteResult<T> = {
    /** Relevant data of the deleted entity (for response/logging) */
    deleted: T;
    /** Stats about cascaded deletions (e.g., { deletedImages: 1, total: 1 }) */
    stats: Record<string, number>;
};