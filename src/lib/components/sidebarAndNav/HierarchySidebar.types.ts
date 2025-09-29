// === CONFIG TIME TREE ===========================================================================

// 1. HierarchyItem is made generic to capture the literal type of the key (K).
export type HierarchyItem<K extends string> = {
  key: K;
  type: "object" | "list"; // object: is concpetually a "detail page/view", list: is conceptually a "1:n" or "n:m" list.
  label: string;
  count?: number | null;
  disabled?: boolean;
  urlParamName?: string;
  href?: string | undefined; // Navigation
  display?: boolean | undefined; // Show it in UI or not
  isMarkedActive?: boolean | undefined; // If marked as active element in the UI
};

// 2. HierarchyTreeNode is also made generic over the key K and its children C.
export type HierarchyTreeNode<
  K extends string,
  // C is the exact type of the children array
  C extends readonly HierarchyTreeNode<any, any>[] | undefined,
> = {
  item: HierarchyItem<K>;
  // The type of defaultChild is derived directly from the 'key' values of the children in C.
  defaultChild?: C extends readonly any[] ? C[number]["item"]["key"] : never;
  children?: C;
};

// Top-level types
export type Hierarchy = HierarchyTree[];
export type HierarchyTree = {
  name: string;
  rootItem: HierarchyTreeNode<any, any>;
};

// 3. An improved helper function that instructs TypeScript to infer the most specific types.
// The `<const ...>` annotations are crucial here.
export const createHierarchyNode = <const K extends string, const C extends readonly HierarchyTreeNode<any, any>[] | undefined>(node: {
  item: HierarchyItem<K>;
  defaultChild?: C extends readonly any[] ? C[number]["item"]["key"] : never;
  children?: C;
}): HierarchyTreeNode<K, C> => node;

// === RUNTIME TREE ===============================================================================

export type RuntimeHierarchyTree = {
  name: string;
  rootItem: RuntimeHierarchyTreeNode;
};

export type RuntimeHierarchyTreeNode = {
  item: RuntimeHierarchyItem;
  children?: RuntimeHierarchyTreeNode[] | undefined;
  defaultChild?: string | undefined;
};

export type RuntimeHierarchyItem = HierarchyItem<string> & {
  urlParamValue: string | number | "leaf";
  level: number | undefined; // 0..3 for indentation
  resolvedHref?: string | undefined;
  // href will be built based on urlParamName and urlParamValue
};

/**
 * Type guard for RuntimeHierarchyTreeNode.
 * @param node
 * @returns
 */
export function isRuntimeHierarchyTreeNode(node: unknown): node is RuntimeHierarchyTreeNode {
  if (typeof node !== "object" || node === null) {
    return false;
  }
  const obj = node as Record<string, unknown>;
  if (!("item" in obj) || typeof obj.item !== "object" || obj.item === null) {
    return false;
  }
  const item = obj.item as Record<string, unknown>;
  return (
    "key" in item &&
    typeof item.key === "string" &&
    "type" in item &&
    (item.type === "object" || item.type === "list") &&
    "label" in item &&
    typeof item.label === "string" &&
    "urlParamValue" in item &&
    "level" in item
  );
}

// === SAMPLES ====================================================================================

// Sample for app secific HierarchyItem
export type AppSpecificHierarchyItem<T extends string> = HierarchyItem<T> & {
  key: "suppliers" | "categories" | "offerings" | "attributes" | "links";
  urlParamName: "supplierId" | "categoryId" | "offeringId" | "leaf";
};
