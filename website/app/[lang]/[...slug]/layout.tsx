import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getDocsPageTree } from '@/lib/source';
import { isDevelopmentDocs } from '@/lib/publication';
import { baseOptions } from '@/lib/layout.shared';

export default async function AuthoringDocsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string; slug: string[] }>;
}) {
  const { lang, slug } = await params;
  if (!isDevelopmentDocs(slug)) notFound();

  return (
    <DocsLayout tree={getDocsPageTree(lang)} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
