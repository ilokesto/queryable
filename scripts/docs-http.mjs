import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function auditDocsHttp(origin) {
  const base = new URL(origin);
  const requests = [];
  const get = async (pathname, expectedStatus) => {
    const response = await fetch(new URL(pathname, base), {
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, expectedStatus, `${pathname}: HTTP ${response.status}`);
    requests.push({
      path: pathname,
      status: response.status,
      contentType: response.headers.get('content-type'),
      robots: response.headers.get('x-robots-tag'),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
    return { response, bytes, text: bytes.toString('utf8') };
  };

  for (const locale of ['en', 'ko']) {
    const page = await get(`/${locale}/queryable/next`, 200);
    assert.match(page.response.headers.get('content-type') ?? '', /text\/html/);
    assert.match(page.text, new RegExp(`<html[^>]+lang="${locale}"`));
    assert.match(page.text, /data-doc-channel="next"/);
    assert.match(page.response.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.equal((await get(`/${locale}/queryable`, 404)).response.status, 404);
    assert.equal((await get(`/${locale}/modal/next`, 404)).response.status, 404);

    const markdown = await get(
      `/llms.mdx/docs/${locale}/queryable/next/content.md`,
      200,
    );
    assert.match(markdown.response.headers.get('content-type') ?? '', /text\/markdown/);
    assert.match(markdown.text, /Queryable/);

    const image = await get(`/og/docs/${locale}/queryable/next/image.webp`, 200);
    assert.match(image.response.headers.get('content-type') ?? '', /image\/webp/);
    assert.equal(image.bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(image.bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  }

  const search = await get('/api/search/next?query=LAZY&locale=en', 200);
  const searchResults = JSON.parse(search.text);
  assert.ok(Array.isArray(searchResults) && searchResults.length > 0);
  assert.ok(searchResults.every(result => result.url.startsWith('/en/queryable/next')));
  assert.equal((await get('/api/search?query=Queryable&locale=en', 404)).response.status, 404);

  const nextIndex = await get('/llms-next.txt', 200);
  assert.match(nextIndex.text, /Queryable/);
  const publicIndex = await get('/llms.txt', 200);
  assert.doesNotMatch(publicIndex.text, /queryable/i);
  const publicFull = await get('/llms-full.txt', 200);
  assert.doesNotMatch(publicFull.text, /queryable/i);

  assert.equal((await get('/en/queryable/next/unknown-page', 404)).response.status, 404);
  return {
    status: 'pass',
    mode: 'private-authoring-only',
    origin: base.origin,
    requests,
    searchResults: searchResults.length,
    releasedRoutes: 2,
    unknownRoutes: 3,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.argv[2];
  if (!origin) {
    process.stderr.write(`${JSON.stringify({ status: 'fail', code: 'ORIGIN_REQUIRED' })}\n`);
    process.exitCode = 1;
  } else {
    auditDocsHttp(origin).then(result => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }).catch(error => {
      process.stderr.write(`${JSON.stringify({
        status: 'fail',
        code: error.code ?? 'HTTP_ASSERTION',
        message: error.message,
      })}\n`);
      process.exitCode = 1;
    });
  }
}
