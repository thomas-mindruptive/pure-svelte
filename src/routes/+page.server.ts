import { log } from '$lib/utils/logger';
import { redirect } from '@sveltejs/kit';

export const load = () => {
  log.info(`Redirecting to /suppliers`);
  throw redirect(307, '/suppliers');
};