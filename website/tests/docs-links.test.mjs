import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicPackageNames, rewriteDocsLink, rewriteMarkdownLinks } from '../lib/docs-links.mjs';

test('foreign public docs links: every known package -> retained localized host', () => {
  for (const locale of ['en', 'ko']) {
    for (const name of publicPackageNames) {
      assert.equal(
        rewriteDocsLink(`/${locale}/${name}`, true, 'queryable'),
        `https://ilokesto.ayden94.com/${locale}/${name}/next`,
      );
      assert.equal(
        rewriteDocsLink(`/${locale}/${name}/next/core-concepts`, true, 'queryable'),
        `https://ilokesto.ayden94.com/${locale}/${name}/next/core-concepts`,
      );
    }
  }
});

test('same-package navigation: next docs -> stays on the local authoring host', () => {
  assert.equal(
    rewriteDocsLink('/ko/queryable/next/quick-start', true, 'queryable'),
    '/ko/queryable/next/quick-start',
  );
});

test('Markdown links: prose destinations change while code examples remain byte-stable', () => {
  const markdown = [
    '[foreign](/en/modal/core-concepts)',
    '`[code](/en/modal/core-concepts)`',
    '```md',
    '[fenced](/ko/store)',
    '```',
    '',
  ].join('\n');

  assert.equal(
    rewriteMarkdownLinks(markdown, true, 'queryable'),
    [
      '[foreign](https://ilokesto.ayden94.com/en/modal/next/core-concepts)',
      '`[code](/en/modal/core-concepts)`',
      '```md',
      '[fenced](/ko/store)',
      '```',
      '',
    ].join('\n'),
  );
});

test('Queryable source links: current source uses successor root and historical source keeps archive path', () => {
  assert.equal(
    rewriteDocsLink(
      'https://github.com/ilokesto/ilokesto/tree/main/packages/queryable',
      true,
      'queryable',
    ),
    'https://github.com/ilokesto/queryable/tree/main',
  );
  assert.equal(
    rewriteDocsLink(
      'https://github.com/ilokesto/ilokesto/blob/1234567890123456789012345678901234567890/packages/queryable/src/index.ts',
      true,
      'queryable',
    ),
    'https://github.com/ilokesto/queryable/blob/1234567890123456789012345678901234567890/packages/queryable/src/index.ts',
  );
});
