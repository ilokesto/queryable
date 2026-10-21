import { queryable } from 'collections/server';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import type { Node, Root } from 'fumadocs-core/page-tree';
import { i18n } from '@/lib/i18n';
import { docsContentRoute, docsImageRoute, docsRoute } from './shared';
import { rewriteMarkdownLinks } from './docs-links.mjs';
import authoringMode from './docs-mode.json';

const collections = [[`${authoringMode.package}/${authoringMode.channel}`, queryable]] as const;

const docs = collections.flatMap(([prefix, collection]) =>
  collection.docs.map(doc => ({
    ...doc,
    info: { ...doc.info, path: `${prefix}/${doc.info.path}` },
  })),
);
const meta = collections.flatMap(([prefix, collection]) =>
  collection.meta.map(entry => ({
    ...entry,
    info: { ...entry.info, path: `${prefix}/${entry.info.path}` },
  })),
);

export const source = loader({
  baseUrl: docsRoute,
  source: toFumadocsSource(docs, meta),
  i18n,
  plugins: [lucideIconsPlugin()],
});

const koreanSidebarLabels: Record<string, string> = {
  Introduction: '소개',
  'Quick Start': '빠른 시작',
  'Quick start': '빠른 시작',
  Reference: '레퍼런스',
  Guides: '가이드',
  'Core concepts': '핵심 개념',
};

function translateSidebarName(name: Root['name']) {
  return typeof name === 'string' ? koreanSidebarLabels[name] ?? name : name;
}

function localizeKoreanSidebarNode(node: Node): Node {
  if (node.type === 'folder') {
    return {
      ...node,
      name: translateSidebarName(node.name),
      index: node.index
        ? { ...node.index, name: translateSidebarName(node.index.name) }
        : undefined,
      children: node.children.map(localizeKoreanSidebarNode),
    };
  }

  return { ...node, name: translateSidebarName(node.name) };
}

export function getDocsPageTree(locale: string): Root {
  const tree = source.getPageTree(locale);
  if (locale !== 'ko') return tree;

  return {
    ...tree,
    name: translateSidebarName(tree.name),
    fallback: tree.fallback
      ? {
          ...tree.fallback,
          name: translateSidebarName(tree.fallback.name),
          children: tree.fallback.children.map(localizeKoreanSidebarNode),
        }
      : undefined,
    children: tree.children.map(localizeKoreanSidebarNode),
  };
}

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [page.locale, ...page.slugs, 'image.webp'];
  return { segments, url: `${docsImageRoute}/${segments.join('/')}` };
}

export function getPageMarkdownUrl(page: InferPageType<typeof source>) {
  const segments = [page.locale, ...page.slugs, 'content.md'];
  return { segments, url: `${docsContentRoute}/${segments.join('/')}` };
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const raw = await page.data.getText('raw');
  const content = rewriteMarkdownLinks(
    raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''),
    true,
    authoringMode.package,
  );
  return `# ${page.data.title} (${page.url})\n\n${content}`;
}
