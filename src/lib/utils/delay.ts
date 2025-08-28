/**
 * Sample: await delay(3000)
 * @param ms 
 * @returns 
 */
export default function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}