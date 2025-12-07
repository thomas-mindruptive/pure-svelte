import type { domainTypes } from "@pure/svelte/domain";

export interface OfferingWithGenerationPlan extends domainTypes.OfferingEnrichedView {
    willGenerate: boolean;
    images?:domainTypes.OfferingImageView[];
    filePath?: string;
    imageUrl?: string;
    prompt?: string;
    hasExcplicitImgs?: boolean;
    comment?: string
}

/**
 * Lookups needed for creating an image.
 * We use the Englisch names because AI image gen is better with English.
 */
export type Lookups = {
    productTypes: domainTypes.ProductType[];
    forms: domainTypes.Form[];
    materials: domainTypes.Material[];
    constructionTypes: domainTypes.ConstructionType[];
    surfaceFinishes: domainTypes.SurfaceFinish[];
  
    productTypesMap: Map<number, domainTypes.ProductType>;
    formsMap: Map<number, domainTypes.Form>;
    materilasMap: Map<number, domainTypes.Material>;
    constructionTypesMap: Map<number, domainTypes.ConstructionType>;
    surfaceFinishesMap: Map<number, domainTypes.SurfaceFinish>;
  
    productTypesEN: domainTypes.ProductType[];
    formsEN: domainTypes.Form[];
    materialsEN: domainTypes.Material[];
    constructionTypesEN: domainTypes.ConstructionType[];
    surfaceFinishesEN: domainTypes.SurfaceFinish[];
  
    productTypesMapEN: Map<number, domainTypes.ProductType>;
    formsMapEN: Map<number, domainTypes.Form>;
    materilasMapEN: Map<number, domainTypes.Material>;
    constructionTypesMapEN: Map<number, domainTypes.ConstructionType>;
    surfaceFinishesMapEN: Map<number, domainTypes.SurfaceFinish>;
  }
  