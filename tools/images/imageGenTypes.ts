import type { domainTypes } from "@pure/svelte/domain";

export interface OfferingWithGenerationPlan extends domainTypes.OfferingEnrichedView {
    willGenerate: boolean;
    images?:domainTypes.OfferingImageView[];
}

export interface OfferingWithGenPlanAndImage extends OfferingWithGenerationPlan {
    filePath: string;
    imageUrl: string;
    prompt: string;
}