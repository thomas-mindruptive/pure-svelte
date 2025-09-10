export type Hierarchy = HierarchyTree[];

export type HierarchyTree = {
  name: string;
  rootItem: HierarchyTreeNode;
};

export type HierarchyTreeNode = {
  item: HierarchyItem;
  items?: HierarchyTreeNode[];
};

export type HierarchyItem = {
  // "Configure-time"
  key: string;
  label: string; // already includes counts if you want (e.g. "Suppliers (5)")
  count?: number | null; // optional separate count, shows as a badge if provided
  disabled?: boolean;
  urlParamName: "leaf" | string; // For URL-Building "supplierId", "categoryId", etc.
};

// Will be in "hierarchyConfig.ts"
export type AppSpecificHierarchyItem = HierarchyItem & {
  key: "suppliers" | "categories" | "offerings" | "attributes" | "links";
  urlParamName: "supplierId" | "categoryId" | "offeringId" | "leaf";
};

export type RuntimeHierarchyTree = {
  name: string;
  rootItem: RuntimeHierarchyTreeNode;
};

export type RuntimeHierarchyTreeNode = {
  item: RuntimeHierarchyItem;
  items?: RuntimeHierarchyTreeNode[];
};

export type RuntimeHierarchyItem = HierarchyItem & {
  urlParamValue: string | number | "leaf";
  level: number | undefined; // 0..3 for indentation
  // href will be built based on urlParamName and urlParamValue
};
