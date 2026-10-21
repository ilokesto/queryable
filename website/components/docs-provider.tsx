'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

export function DocsProvider({
  lang,
  children,
}: {
  readonly lang: string;
  readonly children: ReactNode;
}) {
  const korean = lang === 'ko';

  return (
    <RootProvider
      search={{ options: { type: 'fetch', api: '/api/search/next' } }}
      i18n={{
        locale: lang,
        locales: korean
          ? [{ locale: 'en', name: '영어' }, { locale: 'ko', name: '한국어' }]
          : [{ locale: 'en', name: 'English' }, { locale: 'ko', name: 'Korean' }],
        translations: korean
          ? {
              search: '검색',
              searchNoResult: '결과 없음',
              toc: '목차',
              tocNoHeadings: '제목 없음',
              lastUpdate: '마지막 업데이트',
              chooseLanguage: '언어 선택',
              nextPage: '다음',
              previousPage: '이전',
            }
          : undefined,
      }}
    >
      {children}
    </RootProvider>
  );
}
