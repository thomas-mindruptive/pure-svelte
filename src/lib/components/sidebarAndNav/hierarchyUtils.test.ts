// File: src/lib/components/sidebarAndNav/hierarchyUtils.test.ts

import { describe, it, expect } from 'vitest';
import {
	getPrimitivePathFromUrl,
	reconcilePaths,
	findNodesForPath
} from './hierarchyUtils';
import { validMockTree } from './hierarchyUtils.test.mock';
import { NavigationError } from './navigationError';

// ================================================================================================
// TEST SUITES
// ================================================================================================

describe('getPrimitivePathFromUrl', () => {
	it('should return an empty array for the root path', () => {
		const url = new URL('https://test.com/');
		expect(getPrimitivePathFromUrl(url)).toEqual([]);
	});

	it('should handle a simple static path', () => {
		const url = new URL('https://test.com/suppliers');
		expect(getPrimitivePathFromUrl(url)).toEqual(['suppliers']);
	});

	it('should handle a path with a numeric ID', () => {
		const url = new URL('https://test.com/suppliers/3');
		expect(getPrimitivePathFromUrl(url)).toEqual(['suppliers', 3]);
	});

	it('should handle a deep, mixed path with multiple IDs', () => {
		const url = new URL('https://test.com/suppliers/3/categories/5/attributes');
		expect(getPrimitivePathFromUrl(url)).toEqual(['suppliers', 3, 'categories', 5, 'attributes']);
	});

	it('should correctly handle trailing slashes', () => {
		const url = new URL('https://test.com/suppliers/3/');
		expect(getPrimitivePathFromUrl(url)).toEqual(['suppliers', 3]);
	});

	it('should handle query parameters without affecting the path', () => {
		const url = new URL('https://test.com/suppliers/3?sort=asc');
		expect(getPrimitivePathFromUrl(url)).toEqual(['suppliers', 3]);
	});
});

describe('reconcilePaths', () => {
	const preservedDeepPath = ['suppliers', 5, 'categories', 1, 'offerings', 3];

	it('should adopt the URL path if no preserved path exists', () => {
		const urlPath = ['suppliers', 1];
		expect(reconcilePaths(urlPath, undefined)).toEqual(urlPath);
		expect(reconcilePaths(urlPath, [])).toEqual(urlPath);
	});

	it('should perform Context Preservation when the URL is a prefix', () => {
		const urlPath = ['suppliers', 5, 'categories', 1];
		expect(reconcilePaths(urlPath, preservedDeepPath)).toEqual(preservedDeepPath);
	});
	
	it('should perform Context Preservation for a shallow prefix', () => {
		const urlPath = ['suppliers', 5];
		expect(reconcilePaths(urlPath, preservedDeepPath)).toEqual(preservedDeepPath);
	});

	it('should perform Context Reset when paths diverge', () => {
		const urlPath = ['suppliers', 1]; // Diverges at index 1
		expect(reconcilePaths(urlPath, preservedDeepPath)).toEqual(urlPath);
	});
	
	it('should perform Context Reset on a deep divergence', () => {
		const urlPath = ['suppliers', 5, 'categories', 2]; // Diverges at index 3
		expect(reconcilePaths(urlPath, preservedDeepPath)).toEqual(urlPath);
	});

	it('should perform Context Deepening when the URL extends the preserved path', () => {
		const preservedShortPath = ['suppliers', 5];
		const urlPath = ['suppliers', 5, 'categories', 1];
		expect(reconcilePaths(urlPath, preservedShortPath)).toEqual(urlPath);
	});

	it('should handle identical paths by returning the new path', () => {
		const urlPath = ['suppliers', 5];
		expect(reconcilePaths(urlPath, urlPath)).toEqual(urlPath);
	});
});

describe('findNodesForPath', () => {
	// --- Success cases ---
	it('should return the correct nodes for a valid, deep path', () => {
		const path = ['suppliers', 1, 'categories', 2, 'offerings', 3];
		const nodes = findNodesForPath(validMockTree, path);
		expect(nodes).toHaveLength(6);
		expect(nodes[nodes.length - 1].item.key).toBe('offering');
	});

	it('should return the correct nodes for a valid, shallow path with a sibling branch', () => {
		const path = ['suppliers', 1, 'addresses'];
		const nodes = findNodesForPath(validMockTree, path);
		expect(nodes).toHaveLength(3);
		expect(nodes[nodes.length - 1].item.key).toBe('addresses');
	});

	// --- Error cases ---
	it('should throw ERR_ROOT_MISMATCH for a path that does not match the tree root', () => {
		const path = ['wrong_root', 1];
		try {
			findNodesForPath(validMockTree, path);
			expect.fail('Should have thrown a NavigationError');
		} catch (e) {
			expect(e).toBeInstanceOf(NavigationError);
			if (e instanceof NavigationError) {
				expect(e.code).toBe('ERR_ROOT_MISMATCH');
			}
		}
	});

	it('should throw ERR_PATH_EMPTY for an empty primitive path', () => {
		const path: (string | number)[] = [];
		try {
			findNodesForPath(validMockTree, path);
			expect.fail('Should have thrown a NavigationError');
		} catch (e) {
			expect(e).toBeInstanceOf(NavigationError);
			if (e instanceof NavigationError) {
				expect(e.code).toBe('ERR_PATH_EMPTY');
			}
		}
	});

	it('should throw ERR_INVALID_STRING_SEGMENT for a path with an invalid string segment', () => {
		const path = ['suppliers', 1, 'nonexistent_key'];
		try {
			findNodesForPath(validMockTree, path);
			expect.fail('Should have thrown a NavigationError');
		} catch (e) {
			expect(e).toBeInstanceOf(NavigationError);
			if (e instanceof NavigationError) {
				expect(e.code).toBe('ERR_INVALID_STRING_SEGMENT');
			}
		}
	});

	it('should throw ERR_ID_NOT_ALLOWED for a path with a numeric ID where none is allowed', () => {
		// The `addresses` node in our mock has no `object` child, so it cannot accept an ID.
		const path = ['suppliers', 1, 'addresses', 100];
		try {
			findNodesForPath(validMockTree, path);
			expect.fail('Should have thrown a NavigationError');
		} catch (e) {
			expect(e).toBeInstanceOf(NavigationError);
			if (e instanceof NavigationError) {
				expect(e.code).toBe('ERR_ID_NOT_ALLOWED');
			}
		}
	});

	it('should throw ERR_ID_NOT_ALLOWED for a path that expects a string but gets a number', () => {
		// The `supplier` node expects a string key like 'categories', not another ID.
		const path = ['suppliers', 1, 2];
		try {
			findNodesForPath(validMockTree, path);
			expect.fail('Should have thrown a NavigationError');
		} catch (e) {
			expect(e).toBeInstanceOf(NavigationError);
			if (e instanceof NavigationError) {
				expect(e.code).toBe('ERR_ID_NOT_ALLOWED');
			}
		}
	});

	it('should throw ERR_INVALID_STRING_SEGMENT for a path that expects a number but gets a string', () => {
		// The `suppliers` node expects a numeric ID for its `object` child, not the string 'categories'.
		const path = ['suppliers', 'categories'];
		try {
			findNodesForPath(validMockTree, path);
			expect.fail('Should have thrown a NavigationError');
		} catch (e) {
			expect(e).toBeInstanceOf(NavigationError);
			if (e instanceof NavigationError) {
				expect(e.code).toBe('ERR_INVALID_STRING_SEGMENT');
			}
		}
	});
});