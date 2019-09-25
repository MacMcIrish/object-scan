import assert from 'assert';
import {
  compile, getEntries,
  getMeta,
  getRecursionPos,
  getWildcardRegex,
  hasMatches,
  isLeaf,
  isMatch,
  isRecursive
} from './util/compiler';
import { findLast } from './util/helper';

const specialChars = /[?!,.*[\]{}]/g;
// @ts-ignore
const escape = (input: string) => input.replace(specialChars, '\\$&');

const isWildcardMatch = (wildcard: string, key: string, isArray: boolean, subSearch: any) => {
  if (wildcard === '**') {
    return true;
  }
  if (wildcard === (isArray ? '[*]' : '*')) {
    return true;
  }
  if (isArray && !wildcard.match(/^\[.*]$/)) {
    return false;
  }
  return (isArray ? `[${key}]` : escape(key)).match(getWildcardRegex(subSearch));
};

const formatPath = (input: any, ctx: any) => (ctx.joined ? input.reduce(
  (p: any, c: any) => `${p}${typeof c === 'number' ? `[${c}]` : `${p ? '.' : ''}${escape(c)}`}`,
  ''
) : [...input]);

const find = (haystack_: any, searches_: any, ctx: any) => {
  const result = [];

  const stack = [false, searches_, null, 0];
  const path = [];
  const parents = [];

  let haystack = haystack_;
  do {
    const depth = stack.pop();
    const segment = stack.pop();
    const searches = stack.pop();
    const isResult = stack.pop();

    const diff = path.length - depth;
    for (let idx = 0; idx < diff; idx += 1) {
      parents.pop();
      path.pop();
    }
    if (diff === -1) {
      parents.push(haystack);
      path.push(segment);
      haystack = haystack[segment];
    } else if (segment !== null) {
      path[path.length - 1] = segment;
      haystack = parents[parents.length - 1][segment];
    } else {
      haystack = haystack_;
    }

    if (isResult) {
      if (
        ctx.filterFn === undefined
        || ctx.filterFn(formatPath(path, ctx), haystack, getMeta(searches, parents)) !== false
      ) {
        result.push(formatPath(path, ctx));
      }
      // eslint-disable-next-line no-continue
      continue;
    }

    if (!searches.some((s: any) => hasMatches(s))) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const recurseHaystack = ctx.breakFn === undefined
      || ctx.breakFn(formatPath(path, ctx), haystack, getMeta(searches, parents)) !== true;

    if (ctx.useArraySelector === false && Array.isArray(haystack)) {
      if (recurseHaystack) {
        for (let idx = 0, len = haystack.length; idx < len; idx += 1) {
          stack.push(false, searches, idx, depth + 1);
        }
      }
      // eslint-disable-next-line no-continue
      continue;
    }

    if (isMatch(findLast(searches, (s: string) => isLeaf(s)))) {
      stack.push(true, searches, segment, depth);
    }

    if (searches[0][''] !== undefined && path.find((p) => typeof p === 'string') === undefined) {
      assert(searches.length === 1);
      stack.push(false, [searches[0]['']], segment, depth);
    }

    if (recurseHaystack && haystack instanceof Object) {
      const isArray = Array.isArray(haystack);
      const keys = isArray ? haystack : Object.keys(haystack);
      for (let kIdx = 0, kLen = keys.length; kIdx < kLen; kIdx += 1) {
        const key = isArray ? kIdx : keys[kIdx];
        const searchesOut = [];
        for (let sIdx = 0, sLen = searches.length; sIdx < sLen; sIdx += 1) {
          const search = searches[sIdx];
          const recursionPos = isRecursive(search) ? getRecursionPos(search) : null;
          if (recursionPos === 0) {
            searchesOut.push(search);
          }
          const entries = getEntries(search);
          for (let eIdx = 0, eLen = entries.length; eIdx < eLen; eIdx += 1) {
            const entry = entries[eIdx];
            if (isWildcardMatch(entry[0], key, isArray, entry[1])) {
              searchesOut.push(entry[1]);
            }
            if (eIdx + 1 === recursionPos) {
              searchesOut.push(search);
            }
          }
        }
        stack.push(false, searchesOut, key, depth + 1);
      }
    }
  } while (stack.length !== 0);

  return result;
};

export default (needles: any, opts: any = {}): any => {
  assert(Array.isArray(needles));
  assert(opts instanceof Object && !Array.isArray(opts));
  if (needles.length === 0) {
    return () => [];
  }

  const ctx = {
    filterFn: undefined,
    breakFn: undefined,
    joined: true,
    useArraySelector: true,
    strict: true,
    ...opts
  };
  assert(Object.keys(ctx).length === 5, 'Unexpected Option provided!');
  assert(['function', 'undefined'].includes(typeof ctx.filterFn));
  assert(['function', 'undefined'].includes(typeof ctx.breakFn));
  assert(typeof ctx.joined === 'boolean');
  assert(typeof ctx.useArraySelector === 'boolean');
  assert(typeof ctx.strict === 'boolean');

  const search = compile(needles, ctx.strict); // keep separate for performance
  return (haystack: string) => find(haystack, [search], ctx);
};