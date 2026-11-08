import 'server-only';
import { cookies } from 'next/headers';
import { parseView, VIEW_COOKIE, type ViewPrefs } from './viewPrefs';

export async function getViewPrefs(): Promise<ViewPrefs> {
  return parseView((await cookies()).get(VIEW_COOKIE)?.value);
}
