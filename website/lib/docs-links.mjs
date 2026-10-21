export const publicPackageNames = [
  'store',
  'state',
  'form',
  'overlay',
  'modal',
  'toast',
  'fetcher',
  'utilinent',
];

export function rewriteDocsLink(href, development, owner) {
  if (!href) return href;
  const route = /^\/(en|ko)\/([^/#?]+)(.*)$/.exec(href);
  if (route && publicPackageNames.includes(route[2])) {
    const [, locale, name, tail] = route;
    const suffix = development && !/^\/next(?:\/|#|\?|$)/.test(tail)
      ? `/next${tail}`
      : tail;
    return `${name === owner ? '' : 'https://ilokesto.ayden94.com'}/${locale}/${name}${suffix}`;
  }

  const historicalSource = /^https:\/\/github\.com\/(?:ilokesto|ayden94)\/ilokesto\/(tree|blob)\/([^/]+)\/packages\/queryable(.*)$/.exec(href);
  if (historicalSource) {
    const [, kind, revision, tail] = historicalSource;
    const location = revision === 'main' ? tail : `/packages/queryable${tail}`;
    return `https://github.com/ilokesto/queryable/${kind}/${revision}${location}`;
  }

  if (/^https:\/\/github\.com\/(?:ilokesto|ayden94)\/ilokesto\/?$/.test(href)) {
    return 'https://github.com/ilokesto/queryable';
  }

  return href;
}

export function rewriteMarkdownLinks(markdown, development, owner) {
  let fence;
  let prose = '';
  let output = '';
  const flush = () => {
    output += rewriteInline(prose, development, owner);
    prose = '';
  };

  for (const line of markdown.split(/(?<=\n)/)) {
    const marker = /^\s*(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (marker) {
      flush();
      if (!fence) {
        fence = { marker: marker[1][0], length: marker[1].length };
      } else if (
        marker[1][0] === fence.marker
        && marker[1].length >= fence.length
        && !marker[2].trim()
      ) {
        fence = undefined;
      }
      output += line;
    } else if (fence || /^(?: {4}|\t)/.test(line)) {
      flush();
      output += line;
    } else {
      prose += line;
    }
  }

  flush();
  return output;
}

function rewriteInline(line, development, owner) {
  const rewrite = chunk => chunk
    .replace(
      /(\]\(\s*<?)(\/(?:en|ko)\/[^\s)>]+|https:\/\/github\.com\/[^\s)>]+)/g,
      (_match, prefix, href) => prefix + rewriteDocsLink(href, development, owner),
    )
    .replace(
      /^(\s{0,3}\[[^\]]+\]:\s*<?)(\/(?:en|ko)\/[^\s>]+|https:\/\/github\.com\/[^\s>]+)/gm,
      (_match, prefix, href) => prefix + rewriteDocsLink(href, development, owner),
    );
  let output = '';
  let cursor = 0;

  for (const match of line.matchAll(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g)) {
    output += rewrite(line.slice(cursor, match.index)) + match[0];
    cursor = match.index + match[0].length;
  }

  return output + rewrite(line.slice(cursor));
}
