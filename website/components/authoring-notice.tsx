export function AuthoringNotice({ lang }: { lang: string }) {
  const korean = lang === 'ko';

  return (
    <aside
      data-doc-channel="next"
      className="mb-8 rounded-sm border border-fd-border bg-fd-card px-4 py-3 text-sm leading-6 text-fd-muted-foreground"
      aria-label={korean ? '비공개 작성 문서' : 'Private authoring documentation'}
    >
      <span className="font-semibold text-fd-foreground">
        {korean ? '비공개 베타 문서' : 'Private beta documentation'}
      </span>
      <span className="ml-2">
        {korean
          ? '작성 중인 문서이며 출시된 패키지 레퍼런스가 아닙니다.'
          : 'This is authoring content, not a released package reference.'}
      </span>
    </aside>
  );
}
