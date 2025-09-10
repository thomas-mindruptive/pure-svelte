  export type Hierarchy = HierarchyTree[];

  export type HierarchyTree = {
    name: string;
    rootItem: HierarchyTreeNode;
  }

  export type HierarchyTreeNode = {
    item: HierarchyItem;
    items?: HierarchyTreeNode[];
  };

  export type HierarchyItem = {
    key: "suppliers" | "categories" | "offerings" | "attributes" | "links" | (string & {});
    label: string; // already includes counts if you want (e.g. "Suppliers (5)")
    count?: number | null; // optional separate count, shows as a badge if provided
    disabled?: boolean;
    level?: number | undefined; // 0..3 for indentation
    href: string;
    urlParamName?: string | undefined;    // For URL-Building "supplierId", "categoryId", etc.
  };