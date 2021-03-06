const compiler = require("./util/compiler");

const escape = input => String(input).replace(/[,.*[\]{}]/g, "\\$&");

const matches = (wildcard, key, isArray, subSearch) => {
  if (wildcard === (isArray ? "[*]" : "*")) {
    return true;
  }
  if (isArray && !wildcard.match(/^\[.*]$/)) {
    return false;
  }
  return (isArray ? `[${key}]` : escape(key)).match(compiler.getWildcardRegex(subSearch));
};

const formatPath = (input, ctx) => (ctx.joined ? input.reduce((p, c) => {
  const isNumber = typeof c === "number";
  // eslint-disable-next-line no-nested-ternary
  return `${p}${isNumber || p === "" ? "" : "."}${isNumber ? `[${c}]` : (ctx.escapePaths ? escape(c) : c)}`;
}, "") : input);

const find = (haystack, search, pathIn, parents, ctx) => {
  const recurseHaystack = ctx.breakFn === undefined
    || ctx.breakFn(formatPath(pathIn, ctx), haystack, Object.assign(compiler.getMeta(search), { parents })) !== true;

  const result = [];
  if (ctx.useArraySelector === false && Array.isArray(haystack)) {
    if (compiler.isMatch(search)) {
      if (ctx.arrayCallbackFn !== undefined) {
        ctx.arrayCallbackFn(formatPath(pathIn, ctx), haystack, Object.assign(compiler.getMeta(search), { parents }));
      }
    }
    if (recurseHaystack) {
      for (let i = 0; i < haystack.length; i += 1) {
        result.push(...find(haystack[i], search, pathIn.concat(i), parents, ctx));
      }
    }
    return result;
  }
  if (search[""] !== undefined && parents.length === 0) {
    result.push(...find(haystack, search[""], pathIn, parents, ctx));
  }

  if (compiler.isMatch(search)) {
    if (
      ctx.filterFn === undefined
      || ctx.filterFn(formatPath(pathIn, ctx), haystack, Object.assign(compiler.getMeta(search), { parents })) !== false
    ) {
      if (ctx.callbackFn !== undefined) {
        ctx.callbackFn(formatPath(pathIn, ctx), haystack, Object.assign(compiler.getMeta(search), { parents }));
      }
      result.push(formatPath(pathIn, ctx));
    }
  }
  if (recurseHaystack && haystack instanceof Object) {
    const isArray = Array.isArray(haystack);
    const parentsOut = [haystack].concat(parents);
    Object.entries(haystack).forEach(([key, value]) => {
      const pathOut = pathIn.concat(isArray ? parseInt(key, 10) : key);
      Object.entries(search).forEach(([entry, subSearch]) => {
        if (entry === "**") {
          [subSearch, search].forEach(s => result.push(...find(value, s, pathOut, parentsOut, ctx)));
        } else if (matches(entry, key, isArray, subSearch)) {
          result.push(...find(value, subSearch, pathOut, parentsOut, ctx));
        }
      });
    });
  }
  return result;
};

module.exports = (needles, {
  filterFn = undefined,
  breakFn = undefined,
  callbackFn = undefined,
  arrayCallbackFn = undefined,
  joined = true,
  escapePaths = true,
  useArraySelector = true
} = {}) => {
  const search = compiler.compile(new Set(needles)); // keep separate for performance
  return haystack => [...new Set(find(haystack, search, [], [], {
    filterFn,
    breakFn,
    callbackFn,
    arrayCallbackFn,
    joined,
    escapePaths,
    useArraySelector
  }))];
};
