// src/routes/(browser)/+layout.ts - SIMPLIFIED (NO COUNTS)

import type { LoadEvent } from '@sveltejs/kit';

export async function load({ url, params }: LoadEvent) {
  const supplierId = params.supplierId ? Number(params.supplierId) : null;
  const categoryId = params.categoryId ? Number(params.categoryId) : null;
  const offeringId = params.offeringId ? Number(params.offeringId) : null;

  // Bestimme das aktive "Level"
  let activeLevel = 'suppliers';
  if (supplierId && !categoryId) activeLevel = 'categories';
  if (categoryId && !offeringId) activeLevel = 'offerings';
  if (offeringId) {
    activeLevel = url.pathname.endsWith('/links') ? 'links' : 'attributes';
  }

  // Baue die Basis-Pfade für die Navigation
  const supplierPath = supplierId ? `/suppliers/${supplierId}` : '#';
  const categoryPath = categoryId ? `${supplierPath}/categories/${categoryId}` : '#';
  const offeringPath = offeringId ? `${categoryPath}/offerings/${offeringId}` : '#';

  // Erstelle die Sidebar-Items OHNE Zähler
  const sidebarItems = [
    { key: "suppliers", label: `Suppliers`, disabled: false, level: 0, href: '/suppliers' },
    { key: "categories", label: `Categories`, disabled: !supplierId, level: 1, href: supplierPath },
    { key: "offerings", label: `Offerings`, disabled: !categoryId, level: 2, href: categoryPath },
    { key: "attributes", label: `Attributes`, disabled: !offeringId, level: 3, href: `${offeringPath}/attributes` },
    { key: "links", label: `Links`, disabled: !offeringId, level: 3, href: `${offeringPath}/links` },
  ];

  // count-Eigenschaft wird nicht mehr benötigt
  // Die 'disabled' Logik bleibt, um ungültige Navigation zu verhindern

  return {
    sidebarItems,
    activeLevel,
  };
}