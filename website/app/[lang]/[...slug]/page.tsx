import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { DocsBody, DocsPage } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { AuthoringNotice } from '@/components/authoring-notice';
import { getMDXComponents } from '@/components/mdx';
import { rewriteDocsLink } from '@/lib/docs-links.mjs';
import { getPageImage, source } from '@/lib/source';
import { isDevelopmentDocs } from '@/lib/publication';

export const dynamicParams = false;

export default async function AuthoringPage({
  params,
}: PageProps<'/[lang]/[...slug]'>) {
  const { lang, slug } = await params;
  const page = source.getPage(slug, lang);
  if (!page || !isDevelopmentDocs(slug)) notFound();

  const MDX = page.data.body;
  const RelativeLink = createRelativeLink(source, page);

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{ style: 'clerk' }}
      tableOfContentPopover={{ style: 'clerk' }}
    >
      <AuthoringNotice lang={lang} />
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: ({ href, ...props }) => (
              <RelativeLink
                {...props}
                href={rewriteDocsLink(href, true, 'queryable')}
              />
            ),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: PageProps<'/[lang]/[...slug]'>): Promise<Metadata> {
  const { lang, slug } = await params;
  const page = source.getPage(slug, lang);
  if (!page || !isDevelopmentDocs(slug)) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    robots: { index: false, follow: false },
    openGraph: { images: getPageImage(page).url },
  };
}
