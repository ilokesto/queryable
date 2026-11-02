import type { KeyCollisionPolicy } from "./entries.js";

/** Traverse roots and descendants in breadth-first order. */
export const BFS = Symbol("bfs");
/** Traverse each root and its descendants in preorder depth-first order. */
export const DFS = Symbol("dfs");

/** Original-input location supplied to child, identity, and output-key selectors. */
export interface TraversalContext<T> {
  /** Local input key, independent of the selected output key. */
  readonly key: string;
  /** Original root value shared by every descendant on this path. */
  readonly root: T;
  /** Original local input key of the root. */
  readonly rootKey: string;
  /** Original local keys, including the root key. A fresh array on each read. */
  readonly path: readonly string[];
  /** Roots have depth zero. */
  readonly depth: number;
}

/** Visited payload paired with its original-input traversal context. */
export interface TraversalNode<T> extends TraversalContext<T> {
  /** Original visited value; payloads are not cloned or inspected. */
  readonly value: T;
}

/** Inclusive depth, optional global identity suppression, and output collision policy. */
export interface TraversalOptions<T> {
  /** Inclusive; a nonnegative safe integer or Infinity (the default). */
  readonly maxDepth?: number;
  /** Skip previously visited identities and their descendants, across all roots. */
  readonly visitIdentity?: (value: T, context: TraversalContext<T>) => unknown;
  /** Policy applied by the query boundary to selected output keys; defaults to error. */
  readonly duplicateKeys?: KeyCollisionPolicy;
}

/** Produces locally keyed children after their parent is yielded, unless at maxDepth. */
export type ChildrenSelector<T> = (value: T, context: TraversalContext<T>) => Iterable<readonly [string, T]>;
/** Chooses an output key independently of original local keys and paths. */
export type TraversalKeySelector<T> = (value: T, context: TraversalContext<T>) => string;

interface PathLink {
  readonly key: string;
  readonly parent: PathLink | undefined;
}

interface Frame<T> {
  readonly iterator: Iterator<readonly [string, T]>;
  readonly parent: TraversalNode<T> | undefined;
  readonly path: PathLink | undefined;
}

/**
 * @description Resolves the inclusive depth bound before iterator acquisition, throwing RangeError unless it is a nonnegative safe integer or Infinity.
 * @param {TraversalOptions<T>} options - Traversal settings whose depth bound is validated.
 * @param {number} [options.maxDepth] - Inclusive maximum depth; omitted means Infinity.
 * @param {(value: T, context: TraversalContext<T>) => unknown} [options.visitIdentity] - Identity selector used during traversal, not called by this validator.
 * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output collision policy, not applied by this validator.
 * @returns {number} Validated depth bound; roots have depth zero.
 * @example
 * ```ts
 * traversalDepth({ maxDepth: 2 }); // 2
 * traversalDepth({}); // Infinity
 * ```
 */
export function traversalDepth<T>(options: TraversalOptions<T>): number {
  const depth = options.maxDepth === undefined ? Infinity : options.maxDepth;
  if (depth !== Infinity && (!Number.isSafeInteger(depth) || depth < 0)) {
    throw new RangeError("Traversal maxDepth must be a nonnegative safe integer or Infinity");
  }
  return depth;
}

function nodeAt<T>(key: string, value: T, parent: TraversalNode<T> | undefined, link: PathLink): TraversalNode<T> {
  return {
    key,
    value,
    root: parent ? parent.root : value,
    rootKey: parent ? parent.rootKey : key,
    depth: parent ? parent.depth + 1 : 0,
    get path(): readonly string[] {
      const keys: string[] = [];
      let cursor: PathLink | undefined = link;
      while (cursor) {
        keys.push(cursor.key);
        cursor = cursor.parent;
      }
      return keys.reverse();
    },
  };
}

/**
 * @description Traverses iteratively in breadth-first or preorder depth-first order, yielding each node before selecting its children. Early exit closes acquired iterators without replacing an existing failure.
 * @param {Iterable<readonly [string, T]>} roots - Locally keyed root entries.
 * @param {ChildrenSelector<T>} children - Selects keyed children only after a yielded node is resumed below maxDepth.
 * @param {TraversalKeySelector<T>} keySelector - Selects the output key using the value and original-input context.
 * @param {TraversalOptions<T>} options - Identity suppression and query-boundary collision settings.
 * @param {number} [options.maxDepth] - Original depth option; the resolved maxDepth argument controls this generator.
 * @param {(value: T, context: TraversalContext<T>) => unknown} [options.visitIdentity] - Skips previously seen SameValueZero identities and their descendants across all roots.
 * @param {KeyCollisionPolicy} [options.duplicateKeys] - Collision policy for the caller's boundary, not applied by this generator.
 * @param {number} maxDepth - Already validated inclusive depth limit; roots have depth zero.
 * @param {boolean} breadthFirst - True visits level by level; false visits descendants before the next sibling.
 * @returns {Generator<readonly [string, TraversalNode<T>]>} Selected output keys and fresh traversal nodes with original values and fresh path arrays on each read.
 * @example
 * ```ts
 * const roots: [string, number][] = [["root", 0]];
 * const entries = traversalEntries(roots, n => n < 1 ? [["child", n + 1]] : [],
 *   (_n, context) => context.path.join("/"), {}, 1, true);
 * [...entries].map(([key]) => key); // ["root", "root/child"]
 * ```
 */
export function* traversalEntries<T>(
  roots: Iterable<readonly [string, T]>,
  children: ChildrenSelector<T>,
  keySelector: TraversalKeySelector<T>,
  options: TraversalOptions<T>,
  maxDepth: number,
  breadthFirst: boolean,
): Generator<readonly [string, TraversalNode<T>]> {
  const frames: Array<Frame<T> | undefined> = [];
  const acquired = new Set<Iterator<readonly [string, T]>>();
  const visited = new Set<unknown>();
  let head = 0;
  let failed = false;
  try {
    const iterator = roots[Symbol.iterator]();
    acquired.add(iterator);
    frames.push({ iterator, parent: undefined, path: undefined });
    while (breadthFirst ? head < frames.length : frames.length > 0) {
      const position = breadthFirst ? head : frames.length - 1;
      const frame = frames[position];
      if (!frame) {
        throw new Error("Missing traversal frame");
      }
      const next = frame.iterator.next();
      if (next.done) {
        acquired.delete(frame.iterator);
        if (breadthFirst) {
          frames[head++] = undefined;
          // Retain only the active frontier, not the full traversal history.
          if (head >= 1024 && head * 2 >= frames.length) {
            frames.splice(0, head);
            head = 0;
          }
        } else {
          frames.pop();
        }
        continue;
      }
      const entry = next.value;
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
        throw new TypeError("Traversal children must be two-element arrays with string keys");
      }
      const [key, value] = entry;
      const link: PathLink = { key, parent: frame.path };
      const node = nodeAt(key, value, frame.parent, link);
      if (options.visitIdentity) {
        const identity = options.visitIdentity(value, node);
        if (visited.has(identity)) {
          continue;
        }
        visited.add(identity);
      }
      yield [keySelector(value, node), node];
      if (node.depth < maxDepth) {
        const iterator = children(value, node)[Symbol.iterator]();
        acquired.add(iterator);
        frames.push({ iterator, parent: node, path: link });
      }
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    let cleanupFailed = false;
    let cleanupError: unknown;
    for (const iterator of acquired) {
      try {
        iterator.return?.();
      } catch (error) {
        if (!cleanupFailed) {
          cleanupFailed = true;
          cleanupError = error;
        }
      }
    }
    if (cleanupFailed && !failed) {
      throw cleanupError;
    }
  }
}
