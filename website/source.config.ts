import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import authoringMode from './lib/docs-mode.json';
import { stringifySearchText } from './lib/stringify-search-text.mjs';

export const queryable = defineDocs({
  dir: authoringMode.canonicalDocs,
  docs: {
    schema: pageSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    remarkStructureOptions: {
      stringify: stringifySearchText,
    },
  },
});
