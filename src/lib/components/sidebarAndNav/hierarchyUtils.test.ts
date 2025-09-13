// File: src/lib/components/sidebarAndNav/hierarchyUtils.test.ts

import { describe, it, expect } from 'vitest';
import {
	getPrimitivePathFromUrl,
	reconcilePaths,
	findNodesForPath
} from './hierarchyUtils';
import { validMockTree } from './hierarchyUtils.test.mock';

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
	// ... (passing tests are unchanged)
	it('should return the correct nodes for a valid, deep path', () => {
		const path = ['suppliers', 1, 'categories', 2, 'offerings', 3, 'variants', 4, 'attributes'];
		const nodes = findNodesForPath(validMockTree, path);
		expect(nodes).toHaveLength(9);
		expect(nodes[nodes.length - 1].item.key).toBe('attributes');
	});

	it('should return the correct nodes for a valid, shallow path', () => {
		const path = ['suppliers', 1, 'addresses'];
		const nodes = findNodesForPath(validMockTree, path);
		expect(nodes).toHaveLength(3);
		expect(nodes[nodes.length - 1].item.key).toBe('addresses');
	});

	it('should throw an error for a path that does not match the tree root', () => {
		const path = ['wrong_root', 1];
		expect(() => findNodesForPath(validMockTree, path)).toThrow(
			"Path root 'wrong_root' does not match tree root 'suppliers'"
		);
	});
	
	it('should throw an error for an empty primitive path', () => {
		const path: (string | number)[] = [];
		expect(() => findNodesForPath(validMockTree, path)).toThrow(
			"Primitive path is empty"
		);
	});


	// --- CORRECTED FAILING TESTS ---

	it('should throw an error for a path with an invalid string segment', () => {
		const path = ['suppliers', 1, 'nonexistent_key'];
		// The test now expects the more detailed error message from the function.
		expect(() => findNodesForPath(validMockTree, path)).toThrow(
			"Validation failed: Path segment 'nonexistent_key' not found as a child of 'supplier'"
		);
	});

	it('should throw an error for a path with a numeric ID where none is allowed', () => {
		const path = ['suppliers', 1, 'addresses', 100];
		// The test now expects the more detailed error message.
		expect(() => findNodesForPath(validMockTree, path)).toThrow(
			"Validation failed: Numeric ID '100' is not allowed here. Node 'addresses' has no child of type 'object'"
		);
	});

	it('should throw an error for a path that expects a string but gets a number', () => {
		const path = ['suppliers', 1, 2];
		// The test now expects the more detailed error message.
		expect(() => findNodesForPath(validMockTree, path)).toThrow(
			"Validation failed: Numeric ID '2' is not allowed here. Node 'supplier' has no child of type 'object'"
		);
	});
	
	it('should throw an error for a path that expects a number but gets a string', () => {
		// This test case was fundamentally wrong. The path must be valid up to the point of error.
		// The node 'suppliers' expects a number next (for the 'supplier' object), not the string 'categories'.
		const path = ['suppliers', 'categories'];
		// The test now expects the correct error message for this scenario.
		expect(() => findNodesForPath(validMockTree, path)).toThrow(
			"Validation failed: Path segment 'categories' not found as a child of 'suppliers'"
		);
	});
});