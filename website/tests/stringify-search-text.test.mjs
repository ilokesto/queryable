import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { structure } from 'fumadocs-core/mdx-plugins';
import { test } from 'node:test';
import { stringifySearchText } from '../lib/stringify-search-text.mjs';

test('Fumadocs structure: canonical bilingual MDX -> plain search text without recursive serialization', async () => {
  for (const file of ['../../docs/index.mdx', '../../docs/index.ko.mdx']) {
    const markdown = await readFile(new URL(file, import.meta.url), 'utf8');
    const data = structure(markdown, [], { stringify: stringifySearchText });

    assert.ok(data.headings.length > 0);
    assert.ok(data.contents.length > 0);
    assert.ok(data.contents.every(entry => typeof entry.content === 'string'));
  }
});
