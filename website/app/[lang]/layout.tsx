import '../global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsProvider } from '@/components/docs-provider';

const inter = Inter({ subsets: ['latin'] });
const locales = ['en', 'ko'] as const;

export const metadata: Metadata = {
  metadataBase: new URL('http://127.0.0.1:3000'),
  title: {
    default: 'Queryable private documentation',
    template: '%s | Queryable',
  },
  description: 'Private authoring documentation for @ilokesto/queryable.',
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return locales.map(lang => ({ lang }));
}

export default async function LanguageLayout({
  children,
  params,
}: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!locales.some(locale => locale === lang)) notFound();

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-[100dvh] flex-col">
        <DocsProvider lang={lang}>{children}</DocsProvider>
      </body>
    </html>
  );
}
