import { ImageResponse } from '@takumi-rs/image-response';
import { generate as DefaultImage } from 'fumadocs-ui/og/takumi';
import { notFound } from 'next/navigation';
import { source } from '@/lib/source';
import { isDevelopmentDocs } from '@/lib/publication';

export const revalidate = false;

export async function GET(
  _request: Request,
  { params }: RouteContext<'/og/docs/[...slug]'>,
) {
  const { slug } = await params;
  if (slug.at(-1) !== 'image.webp') notFound();
  const [lang, ...segments] = slug;
  if (lang !== 'en' && lang !== 'ko') notFound();
  const page = source.getPage(segments.slice(0, -1), lang);
  if (!page || !isDevelopmentDocs(page.slugs)) notFound();

  const response = new ImageResponse(
    <DefaultImage
      title={page.data.title}
      description={page.data.description}
      site="ilokesto"
    />,
    { width: 1200, height: 630, format: 'webp' },
  );
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export function generateStaticParams() {
  return source.getPages().map(page => ({
    slug: [page.locale, ...page.slugs, 'image.webp'],
  }));
}
