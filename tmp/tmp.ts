// export const OfferingDetail_PageTypeSchema = z.discriminatedUnion("pageType", [
//   z.object({
//     pageType: z.literal("attributes"),
//     ...OfferingDetail_LoadDataSchema.shape,
//     assignedAttributes: z.array(...).nullable().default([])
//     availableAttributes: z.array(...).nullable()..default([]),
//     links: z.array(...).optional().default([]), // immer leer für attributes page
//     availableProducts: z.array(...).nullable().optional(),
//   }),
//   z.object({
//     pageType: z.literal("links"), 
//     ...OfferingDetail_LoadDataSchema.shape,
//     links: z.array(...).nullable().optional(),
//     availableProducts: z.array(...).nullable().optional(),
//   }),
// ]);