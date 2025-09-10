// src/routes/(browser)/+layout.ts

import { get } from "svelte/store";
import { log } from "$lib/utils/logger";
import type { LoadEvent } from "@sveltejs/kit";
import { navigationState, type NavigationPath } from "$lib/stores/navigationState";
import { ApiClient } from "$lib/api/client/ApiClient";
import { getSupplierApi } from "$lib/api/client/supplier";
import { getCategoryApi } from "$lib/api/client/category";
import { getOfferingApi } from "$lib/api/client/offering";
import { buildBreadcrumb, type ConservedPath } from "$lib/utils/buildBreadcrumb";
import type { HierarchyTree } from "$lib/components/sidebarAndNav/HierarchySidebar.types";

type EntityNames = {
  supplier: string | null;
  category: string | null;
  offering: string | null | undefined;
};

export async function load({ url, params, depends, fetch: loadEventFetch }: LoadEvent) {
  log.info("(Layout Load) called with URL:", url.href, "and params:", params);
  depends(`url:${url.href}`);

  // DEFINE PATHS FROM SOURCES
  const pathFromUrl: NavigationPath = {
    supplierId: params.supplierId ? Number(params.supplierId) : null,
    categoryId: params.categoryId ? Number(params.categoryId) : null,
    offeringId: params.offeringId ? Number(params.offeringId) : null,
    leaf: url.pathname.endsWith("/attributes") ? "attributes" : url.pathname.endsWith("/links") ? "links" : null,
  };
  const conservedPath = get(navigationState);

  // RECONCILE PATHS
  let finalUiPath: NavigationPath;

  if (pathFromUrl.supplierId && pathFromUrl.supplierId !== conservedPath.supplierId) {
    finalUiPath = { supplierId: pathFromUrl.supplierId, categoryId: null, offeringId: null, leaf: null };
  } else if (pathFromUrl.categoryId && pathFromUrl.categoryId !== conservedPath.categoryId) {
    finalUiPath = { supplierId: conservedPath.supplierId, categoryId: pathFromUrl.categoryId, offeringId: null, leaf: null };
  } else if (pathFromUrl.offeringId && pathFromUrl.offeringId !== conservedPath.offeringId) {
    finalUiPath = { ...conservedPath, offeringId: pathFromUrl.offeringId, leaf: null };
  } else {
    finalUiPath = {
      supplierId: pathFromUrl.supplierId ?? conservedPath.supplierId,
      categoryId: pathFromUrl.categoryId ?? conservedPath.categoryId,
      offeringId: pathFromUrl.offeringId ?? conservedPath.offeringId,
      leaf: pathFromUrl.leaf ?? conservedPath.leaf,
    };
  }
  navigationState.set(finalUiPath);

  const client = new ApiClient(loadEventFetch);

  const entityNames: EntityNames = { supplier: null, category: null, offering: null };

  const promises = [];
  if (finalUiPath.supplierId)
    promises.push(
      getSupplierApi(client)
        .loadSupplier(finalUiPath.supplierId)
        .then((s) => (entityNames.supplier = s.name))
        .catch(() => {}),
    );
  if (finalUiPath.categoryId)
    promises.push(
      getCategoryApi(client)
        .loadCategory(finalUiPath.categoryId)
        .then((c) => (entityNames.category = c.name))
        .catch(() => {}),
    );
  if (finalUiPath.offeringId)
    promises.push(
      getOfferingApi(client)
        .loadOffering(finalUiPath.offeringId)
        .then((o) => (entityNames.offering = o.product_def_title))
        .catch(() => {}),
    );
  await Promise.all(promises);

  // DETERMINE ACTIVE LEVEL & BUILD UI PROPS
  let activeLevel: string;
  if (pathFromUrl.offeringId) {
    activeLevel = pathFromUrl.leaf || "links";
  } else if (pathFromUrl.categoryId) {
    activeLevel = "offerings";
  } else if (pathFromUrl.supplierId) {
    activeLevel = "categories";
  } else {
    activeLevel = "suppliers";
  }

  const breadcrumbItems = buildBreadcrumb({
    url,
    params,
    entityNames,
    conservedPath: finalUiPath as ConservedPath,
    activeLevel,
  });

  const supplierPath = finalUiPath.supplierId ? `/suppliers/${finalUiPath.supplierId}` : "#";
  const categoryPath =
    finalUiPath.supplierId && finalUiPath.categoryId ? `/suppliers/${finalUiPath.supplierId}/categories/${finalUiPath.categoryId}` : "#";
  const offeringPathBase =
    finalUiPath.supplierId && finalUiPath.categoryId && finalUiPath.offeringId
      ? `/suppliers/${finalUiPath.supplierId}/categories/${finalUiPath.categoryId}/offerings/${finalUiPath.offeringId}`
      : "#";

  const supplierHierarchy: HierarchyTree = {
    name: "suppliers",
    rootItem: {
      item: { key: "suppliers", label: "Suppliers", disabled: false, level: 0, href: "/suppliers" },
      items: [
        {
          item: { key: "categories", label: "Categories", disabled: !finalUiPath.supplierId, level: 1, href: supplierPath },
          items: [
            {
              item: { key: "offerings", label: "Offerings", disabled: !finalUiPath.categoryId, level: 2, href: categoryPath },
              items: [
                {
                  item: {
                    key: "attributes",
                    label: "Attributes",
                    disabled: !finalUiPath.offeringId,
                    level: 3,
                    href: offeringPathBase === "#" ? "#" : `${offeringPathBase}/attributes`,
                  },
                },
                {
                  item: {
                    key: "links",
                    label: "Links",
                    disabled: !finalUiPath.offeringId,
                    level: 3,
                    href: offeringPathBase === "#" ? "#" : `${offeringPathBase}/links`,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };

  //   items: [
  //     { key: "suppliers", label: "Suppliers", disabled: false, level: 0, href: "/suppliers" },
  //     { key: "categories", label: "Categories", disabled: !finalUiPath.supplierId, level: 1, href: supplierPath },
  //     { key: "offerings", label: "Offerings", disabled: !finalUiPath.categoryId, level: 2, href: categoryPath },
  //     {
  //       key: "attributes",
  //       label: "Attributes",
  //       disabled: !finalUiPath.offeringId,
  //       level: 3,
  //       href: offeringPathBase === "#" ? "#" : `${offeringPathBase}/attributes`,
  //     },
  //     {
  //       key: "links",
  //       label: "Links",
  //       disabled: !finalUiPath.offeringId,
  //       level: 3,
  //       href: offeringPathBase === "#" ? "#" : `${offeringPathBase}/links`,
  //     },
  //   ],
  // };

  const hierarchy = [supplierHierarchy];

  return { breadcrumbItems, hierarchy, activeLevel };
}
