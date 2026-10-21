import { flexsearchFromSource } from 'fumadocs-core/search/flexsearch';
import { source } from '@/lib/source';

export const revalidate = false;

export const { GET } = flexsearchFromSource(source, {
  localeMap: { ko: 'cjk' },
});
