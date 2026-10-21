export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-12 sm:px-8 lg:px-10">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-prose text-sm leading-6 text-fd-muted-foreground">
        This private authoring site only contains the current Queryable
        documentation.
      </p>
    </main>
  );
}
