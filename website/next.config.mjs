import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

const config = {
  reactStrictMode: true,
  serverExternalPackages: ['@takumi-rs/image-response'],
  headers: async () => [{
    source: '/:path*',
    headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
  }],
};

export default withMDX(config);
