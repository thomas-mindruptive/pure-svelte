// === CONFIG TIME TREE ===========================================================================

// 1. HierarchyItem is made generic to capture the literal type of the key (K).
export type HierarchyItem<K extends string> = {
  key: K;
  label: string;
  count?: number | null;
  disabled?: boolean;
  urlParamName: "leaf" | string;
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
  children?: RuntimeHierarchyTreeNode[];
};

export type RuntimeHierarchyItem = HierarchyItem<string> & {
  urlParamValue: string | number | "leaf";
  level: number | undefined; // 0..3 for indentation
  // href will be built based on urlParamName and urlParamValue
};

// === SAMPLES ====================================================================================

// Sample for app secific HierarchyItem
export type AppSpecificHierarchyItem<T extends string> = HierarchyItem<T> & {
  key: "suppliers" | "categories" | "offerings" | "attributes" | "links";
  urlParamName: "supplierId" | "categoryId" | "offeringId" | "leaf";
};

// --- VALID EXAMPLE CHANGE "defaultChild" to check if tsc shows an error ---
export const validTree = {
  rootItem: createHierarchyNode({
    item: { key: "root", label: "Root", urlParamName: "rootId" },
    defaultChild: "categories", // Correct, because "categories" is a key in `children`
    children: [
      createHierarchyNode({
        item: { key: "categories", label: "Categories", urlParamName: "categoryId" },
        defaultChild: "products", // Correct
        children: [
          createHierarchyNode({
            item: { key: "products", label: "Products", urlParamName: "productId" },
          }),
        ],
      }),
      createHierarchyNode({
        item: { key: "addresses", label: "Addresses", urlParamName: "addressId" },
      }),
    ],
  }),
};
