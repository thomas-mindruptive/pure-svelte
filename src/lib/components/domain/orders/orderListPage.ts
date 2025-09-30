import { type LoadEvent } from "@sveltejs/kit";

export function load({ fetch: loadEventFetch }: LoadEvent) {
  return {loadEventFetch};
}
