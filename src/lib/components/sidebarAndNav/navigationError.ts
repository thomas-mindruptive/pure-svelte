/**
 * Defines a set of machine-readable error codes for navigation errors.
 */
export type NavigationErrorCode =
	| 'ERR_PATH_EMPTY'
	| 'ERR_ROOT_MISMATCH'
	| 'ERR_INVALID_STRING_SEGMENT'
	| 'ERR_ID_NOT_ALLOWED'
	| 'ERR_SEGMENT_MUST_BE_NUMBER';

/**
 * Custom error class for navigation-specific issues.
 * It includes a machine-readable error code to allow for robust testing
 * and programmatic error handling, decoupling it from the human-readable message.
 */
export class NavigationError extends Error {
	public readonly code: NavigationErrorCode;

	constructor(message: string, code: NavigationErrorCode) {
		super(message);
		this.name = 'NavigationError';
		this.code = code;
	}
}
