// --- For verbose logging of all offerings ---
export type OfferingLog = {
  id: number,
  title: string,
  description: string
}

export type ProdDefLog = {
  id: number,
  title: string,
  offerings: OfferingLog[];
}