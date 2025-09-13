import type { RuntimeHierarchyTreeNode } from "./HierarchySidebar.types";

  /**
   * Defines the structure of a single breadcrumb item.
   * This type is exported so other components can use it for type safety.
   */
  export type Crumb = {
    label: string;
    href?: string | undefined;
    active?: boolean;
    node: RuntimeHierarchyTreeNode;
  };