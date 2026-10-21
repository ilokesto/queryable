import { redirect } from 'next/navigation';

export default async function LanguageHome({ params }: PageProps<'/[lang]'>) {
  const { lang } = await params;
  redirect(`/${lang}/queryable/next`);
}
