import { getLLMText, source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { isDevelopmentDocs } from '@/lib/publication';
import { getPageMarkdownUrl } from '@/lib/source';

export const revalidate = false;

export async function GET(
  _request: Request,
  { params }: RouteContext<'/llms.mdx/docs/[[...slug]]'>,
) {
  const { slug } = await params;
  if (!slug || slug.at(-1) !== 'content.md') notFound();
  const [lang, ...segments] = slug;
  if (lang !== 'en' && lang !== 'ko') notFound();
  const page = source.getPage(segments.slice(0, -1), lang);
  if (!page || !isDevelopmentDocs(page.slugs)) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export function generateStaticParams() {
  return source.getPages().map(page => ({
    slug: getPageMarkdownUrl(page).segments,
  }));
}
