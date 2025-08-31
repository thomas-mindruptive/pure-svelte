/**
 * @file Breadcrumb Builder
 */
import { browser } from '$app/environment';
import type { LoadEvent } from '@sveltejs/kit';

// Decoupled from the Svelte file:
export type Crumb = { label: string; href?: string; active?: boolean };

type Params = LoadEvent['params'];

export type ConservedPath = {
  supplierId: number | null;
  categoryId: number | null;
  offeringId: number | null;
  leaf?: 'attributes' | 'links' | null;
};

type BuildBreadcrumbOptions = {
  url: URL;
  params: Params;
  entityNames: {
    supplier: string | null;
    category: string | null;
    offering: string | null | undefined;
  };
  // Optional: Inject the last-active-path from outside (recommended)
  conservedPath?: ConservedPath | null;
  // Optional: controls if '#' is set as href (otherwise undefined = not clickable)
  useHashForDisabled?: boolean;
  activeLevel?: string;
};

export function buildBreadcrumb(opts: BuildBreadcrumbOptions): Crumb[] {
  // 1) Safely get the conserved path
  const empty: ConservedPath = { supplierId: null, categoryId: null, offeringId: null, leaf: null };
  const conserved: ConservedPath =
    opts.conservedPath ??
    (browser
      ? // Lazy import to avoid SSR issues if your store uses sessionStorage
      (() => {
        try {
          const raw = sessionStorage.getItem('sb:lastPath');
          return raw ? (JSON.parse(raw) as ConservedPath) : empty;
        } catch {
          return empty;
        }
      })()
      : empty);

  // 2) Current params
  const curSupplierId = opts.params.supplierId ? Number(opts.params.supplierId) : null;
  const curCategoryId = opts.params.categoryId ? Number(opts.params.categoryId) : null;
  const curOfferingId = opts.params.offeringId ? Number(opts.params.offeringId) : null;

  // 3) Resolved IDs (with strict consistency checks along the hierarchy)
  const resolvedSupplierId = curSupplierId ?? conserved.supplierId ?? null;

  const resolvedCategoryId =
    curCategoryId ??
    (resolvedSupplierId !== null &&
      conserved.supplierId !== null &&
      resolvedSupplierId === conserved.supplierId
      ? conserved.categoryId ?? null
      : null);

  const resolvedOfferingId =
    curOfferingId ??
    (resolvedSupplierId !== null &&
      conserved.supplierId !== null &&
      resolvedSupplierId === conserved.supplierId &&
      resolvedCategoryId !== null &&
      conserved.categoryId !== null &&
      resolvedCategoryId === conserved.categoryId
      ? conserved.offeringId ?? null
      : null);

  // 4) Determine the leaf node (only if an offering exists)
  // --- CORRECTED LOGIC TO AVOID RETURNING `0` ---
  const leafFromUrl = resolvedOfferingId != null
    ? (
      /(?:^|\/)links\/?$/.test(opts.url.pathname)
        ? 'links'
        : /(?:^|\/)attributes\/?$/.test(opts.url.pathname)
          ? 'attributes'
          : null
    )
    : null;

  const resolvedLeaf: ConservedPath['leaf'] =
    leafFromUrl ??
    (resolvedOfferingId &&
      conserved.supplierId === resolvedSupplierId &&
      conserved.categoryId === resolvedCategoryId &&
      conserved.offeringId === resolvedOfferingId
      ? conserved.leaf ?? null
      : null);

  // 5) Generate HREFs
  const none = opts.useHashForDisabled ? '#' : undefined;
  const supplierHref =
    resolvedSupplierId != null ? `/suppliers/${resolvedSupplierId}` : none;
  const categoryHref =
    resolvedSupplierId != null && resolvedCategoryId != null
      ? `/suppliers/${resolvedSupplierId}/categories/${resolvedCategoryId}`
      : supplierHref;
  const offeringHref =
    resolvedSupplierId != null && resolvedCategoryId != null && resolvedOfferingId != null
      ? `/suppliers/${resolvedSupplierId}/categories/${resolvedCategoryId}/offerings/${resolvedOfferingId}`
      : categoryHref;

  // 6) Build the crumbs array
  const crumbs: Crumb[] = [];

  // Level 1: Suppliers list
  crumbs.push({ label: 'Suppliers', href: '/suppliers' });

  // --- CORRECTED OBJECT CREATION TO SATISFY `exactOptionalPropertyTypes` ---

  // Level 2: Supplier detail
  if (resolvedSupplierId != null) {
    crumbs.push({
      label: opts.entityNames.supplier || `Supplier #${resolvedSupplierId}`,
      // Use conditional spread: only add `href` property if supplierHref is a valid string
      ...(supplierHref && { href: supplierHref })
    });
  }

  // Level 3: Category detail
  if (resolvedSupplierId != null && resolvedCategoryId != null) {
    crumbs.push({
      label: opts.entityNames.category || `Category #${resolvedCategoryId}`,
      ...(categoryHref && { href: categoryHref })
    });
  }

  // Level 4: Offering detail
  if (resolvedSupplierId != null && resolvedCategoryId != null && resolvedOfferingId != null) {
    crumbs.push({
      label: opts.entityNames.offering || `Offering #${resolvedOfferingId}`,
      ...(offeringHref && { href: offeringHref })
    });

    // Level 5: leaf (attributes/links)
    if (resolvedLeaf) {
      crumbs.push({
        label: resolvedLeaf === 'links' ? 'Links' : 'Attributes',
        // The href here will always be a valid string if resolvedLeaf exists
        href: `${offeringHref}/${resolvedLeaf}`
      });
    }
  }

  const activeLevelToIndexMap: Record<string, number> = {
    'suppliers': 0,  // Aktiv: Suppliers List Page
    'categories': 1, // Aktiv: Supplier Detail Page
    'offerings': 2,  // Aktiv: Category Detail Page
    // Für 'attributes' und 'links' ist das letzte Element immer korrekt,
    // da sie die tiefste Ebene darstellen.
    'attributes': crumbs.length - 1,
    'links': crumbs.length - 1
  };
  if (opts.activeLevel) {
    const activeIndex = activeLevelToIndexMap[opts.activeLevel];
    crumbs.forEach((crumb, index) => {
      crumb.active = (index === activeIndex);
    });
  }


  // // 7) WRONG: !!!!!! Mark the last crumb as active
  // if (crumbs.length > 0) {
  //   crumbs[crumbs.length - 1].active = true;
  // }

  return crumbs;
}