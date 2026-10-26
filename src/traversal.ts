import type { KeyCollisionPolicy } from "./entries.js";

/** Traverse roots and descendants in breadth-first order. */
export const BFS = Symbol("bfs");
/** Traverse each root and its descendants in preorder depth-first order. */
export const DFS = Symbol("dfs");

export interface TraversalContext<T> {
  /** Local input key, independent of the selected output key. */
  readonly key: string;
  readonly root: T;
  readonly rootKey: string;
  /** Original local keys, including the root key. A fresh array on each read. */
  readonly path: readonly string[];
  /** Roots have depth zero. */
  readonly depth: number;
}

export interface TraversalNode<T> extends TraversalContext<T> {
  readonly value: T;
}

export interface TraversalOptions<T> {
  /** Inclusive; a nonnegative safe integer or Infinity (the default). */
  readonly maxDepth?: number;
  /** Skip previously visited identities and their descendants, across all roots. */
  readonly visitIdentity?: (value: T, context: TraversalContext<T>) => unknown;
  readonly duplicateKeys?: KeyCollisionPolicy;
}

export type ChildrenSelector<T> = (value: T, context: TraversalContext<T>) => Iterable<readonly [string, T]>;
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

/** Validate once, before any iterator acquisition. */
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
 * Iterative preorder stack / level queue. Yield before selecting children, so
 * a prefix consumer never expands its final node. Paths use links internally.
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
