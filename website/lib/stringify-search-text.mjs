/**
 * Flatten a Markdown AST node for Fumadocs search data without serializing
 * Markdown back into Markdown. This preserves text while avoiding recursive
 * MDX stringifier traversal for inline emphasis.
 *
 * @param {unknown} input
 * @returns {string}
 */
export function stringifySearchText(input) {
  if (input === null || typeof input !== 'object') return '';
  const node = /** @type {{ type?: unknown; value?: unknown; alt?: unknown; children?: unknown }} */ (input);

  if (typeof node.value === 'string') return node.value;
  if (node.type === 'image' && typeof node.alt === 'string') return node.alt;
  if (node.type === 'break') return '\n';
  if (!Array.isArray(node.children)) return '';

  const separator = node.type === 'list' || node.type === 'blockquote' ? '\n' : '';
  return node.children.map(stringifySearchText).join(separator);
}
