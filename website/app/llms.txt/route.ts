export const revalidate = false;

export function GET() {
  return new Response('# ilokesto\n\nNo public package documentation is registered on this private authoring site.\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
