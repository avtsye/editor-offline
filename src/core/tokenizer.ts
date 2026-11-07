export type TokenKind =
  | "plain"
  | "keyword"
  | "literal"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "type"
  | "tag"
  | "attribute"
  | "property"
  | "operator"
  | "punctuation";

export type SyntaxToken = { kind: TokenKind; value: string };

const KEYWORDS: Record<string, Set<string>> = {
  javascript: new Set("as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while yield interface type enum implements private protected public readonly declare namespace satisfies keyof infer is abstract".split(" ")),
  typescript: new Set("as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while yield interface type enum implements private protected public readonly declare namespace satisfies keyof infer is abstract".split(" ")),
  python: new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case".split(" ")),
  rust: new Set("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while".split(" ")),
  json: new Set(),
  css: new Set("important media supports keyframes font-face import charset namespace layer container scope".split(" ")),
  html: new Set(),
  sql: new Set("add all alter as asc begin between by case check column commit constraint create cross current_date current_time database default delete desc distinct drop else end except exists foreign from full group having in index inner insert into is join key left like limit not null offset on or order outer primary references right rollback select set table then to truncate union unique update values view when where with".split(" ")),
  c: new Set("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while".split(" ")),
  cpp: new Set("alignas alignof and asm auto bool break case catch char class const constexpr continue decltype default delete do double else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch template this throw true try typedef typename union unsigned using virtual void volatile wchar_t while".split(" ")),
  csharp: new Set("abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while".split(" ")),
  java: new Set("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while".split(" ")),
  go: new Set("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var".split(" ")),
  dart: new Set("abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for Function get hide if implements import in interface is late library mixin new null on operator part required rethrow return set show static super switch sync this throw true try typedef var void while with yield".split(" ")),
};

const LITERALS = new Set(["true", "false", "null", "undefined", "None", "True", "False", "NoneType", "NaN", "Infinity"]);
const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const NUMBER = /^(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?)/;

function pushToken(tokens: SyntaxToken[], kind: TokenKind, value: string): void {
  if (!value) return;
  const previous = tokens[tokens.length - 1];
  if (previous?.kind === kind) previous.value += value;
  else tokens.push({ kind, value });
}

function readQuoted(source: string, start: number, quote: string, triple: boolean): number {
  const delimiter = triple ? quote.repeat(3) : quote;
  let index = start + delimiter.length;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += Math.min(2, source.length - index);
      continue;
    }
    if (source.startsWith(delimiter, index)) return index + delimiter.length;
    if (!triple && source[index] === "\n") return index;
    index += 1;
  }
  return source.length;
}

function readLine(source: string, start: number): number {
  const newline = source.indexOf("\n", start);
  return newline < 0 ? source.length : newline;
}

export function tokenize(source: string, languageId: string): SyntaxToken[] {
  if (!source) return [];
  const requestedLanguage = languageId.toLowerCase();
  const aliases: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", rs: "rust", c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp",
    cs: "csharp", html: "html", xml: "html", yml: "plain", yaml: "plain",
  };
  const lang = aliases[requestedLanguage] ?? requestedLanguage;
  const keywords = KEYWORDS[lang] ?? new Set<string>();
  const tokens: SyntaxToken[] = [];
  let index = 0;
  let insideHtmlTag = false;

  while (index < source.length) {
    const start = index;
    const char = source[index];
    const next = source[index + 1] ?? "";

    if (/\s/.test(char)) {
      index += 1;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      pushToken(tokens, "plain", source.slice(start, index));
      continue;
    }

    if (lang === "html" && source.startsWith("<!--", index)) {
      const close = source.indexOf("-->", index + 4);
      index = close < 0 ? source.length : close + 3;
      pushToken(tokens, "comment", source.slice(start, index));
      continue;
    }

    if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      index = close < 0 ? source.length : close + 2;
      pushToken(tokens, "comment", source.slice(start, index));
      continue;
    }

    if (source.startsWith("//", index) && lang !== "python" && lang !== "sql" && lang !== "html") {
      index = readLine(source, index);
      pushToken(tokens, "comment", source.slice(start, index));
      continue;
    }

    if ((lang === "python" || lang === "sql" || lang === "shell") && (char === "#" || (lang === "sql" && source.startsWith("--", index)))) {
      index = readLine(source, index);
      pushToken(tokens, "comment", source.slice(start, index));
      continue;
    }

    if (lang === "html" && !insideHtmlTag && char === "<" && /[A-Za-z/!]/.test(next)) {
      const closing = next === "/";
      index += closing ? 2 : 1;
      pushToken(tokens, "punctuation", closing ? "</" : "<");
      const nameStart = index;
      while (index < source.length && /[A-Za-z0-9:-]/.test(source[index])) index += 1;
      if (index > nameStart) pushToken(tokens, "tag", source.slice(nameStart, index));
      insideHtmlTag = true;
      continue;
    }

    if (lang === "html" && insideHtmlTag) {
      if (source.startsWith("/>", index)) {
        pushToken(tokens, "punctuation", "/>");
        index += 2;
        insideHtmlTag = false;
        continue;
      }
      if (char === ">") {
        pushToken(tokens, "punctuation", char);
        index += 1;
        insideHtmlTag = false;
        continue;
      }
      if (char === "=" || char === "/" || char === "<") {
        pushToken(tokens, "punctuation", char);
        index += 1;
        continue;
      }
      if (char === "'" || char === '"' || char === String.fromCharCode(96)) {
        index = readQuoted(source, index, char, false);
        pushToken(tokens, "string", source.slice(start, index));
        continue;
      }
      if (IDENTIFIER_START.test(char)) {
        index += 1;
        while (index < source.length && /[A-Za-z0-9_:-]/.test(source[index])) index += 1;
        pushToken(tokens, "attribute", source.slice(start, index));
        continue;
      }
    }

    if (char === "'" || char === '"' || char === String.fromCharCode(96)) {
      const triple = lang === "python" && source.startsWith(char.repeat(3), index);
      index = readQuoted(source, index, char, triple);
      pushToken(tokens, "string", source.slice(start, index));
      continue;
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(next))) {
      const match = NUMBER.exec(source.slice(index));
      if (match) {
        index += match[0].length;
        pushToken(tokens, "number", match[0]);
        continue;
      }
    }

    if (IDENTIFIER_START.test(char)) {
      index += 1;
      while (index < source.length && IDENTIFIER_PART.test(source[index])) index += 1;
      const word = source.slice(start, index);
      if (keywords.has(word)) pushToken(tokens, "keyword", word);
      else if (LITERALS.has(word) || (lang === "json" && ["true", "false", "null"].includes(word))) pushToken(tokens, "literal", word);
      else if (/^[A-Z]/.test(word)) pushToken(tokens, "type", word);
      else {
        let lookahead = index;
        while (lookahead < source.length && /\s/.test(source[lookahead])) lookahead += 1;
        if (source[lookahead] === "(") pushToken(tokens, "function", word);
        else if (lang === "css" && source[lookahead] === ":") pushToken(tokens, "property", word);
        else pushToken(tokens, "plain", word);
      }
      continue;
    }

    if (/[=+\-*%!?<>|&^~:]/.test(char)) {
      index += 1;
      while (index < source.length && /[=+\-*%!?<>|&^~]/.test(source[index])) index += 1;
      pushToken(tokens, "operator", source.slice(start, index));
      continue;
    }

    if (/[{}()[\].,;#]/.test(char)) {
      pushToken(tokens, "punctuation", char);
      index += 1;
      continue;
    }

    pushToken(tokens, "plain", char);
    index += 1;
  }

  return tokens;
}
