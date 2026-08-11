type TokenKind = "identifier" | "number" | "string" | "operator" | "punctuation" | "eof";

interface Token {
  kind: TokenKind;
  value: string;
  position: number;
}

const UNSAFE_PROPERTIES = new Set(["__proto__", "prototype", "constructor"]);
const MULTI_CHAR_OPERATORS = ["===", "!==", ">=", "<=", "==", "!=", "&&", "||"];

function syntaxError(message: string, position: number): Error {
  return new Error(`条件表达式非法（位置 ${position}）：${message}`);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const operator = MULTI_CHAR_OPERATORS.find((candidate) =>
      source.startsWith(candidate, index),
    );
    if (operator) {
      tokens.push({ kind: "operator", value: operator, position: index });
      index += operator.length;
      continue;
    }

    if (char === "!" || char === ">" || char === "<") {
      tokens.push({ kind: "operator", value: char, position: index });
      index += 1;
      continue;
    }

    if (char === "(" || char === ")" || char === ".") {
      tokens.push({ kind: "punctuation", value: char, position: index });
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      const start = index;
      let value = "";
      index += 1;
      let closed = false;
      while (index < source.length) {
        const current = source[index]!;
        if (current === quote) {
          index += 1;
          closed = true;
          break;
        }
        if (current === "\\") {
          const escaped = source[index + 1];
          if (escaped === undefined) break;
          const escapes: Record<string, string> = {
            n: "\n",
            r: "\r",
            t: "\t",
            "\\": "\\",
            "'": "'",
            '"': '"',
          };
          value += escapes[escaped] ?? escaped;
          index += 2;
          continue;
        }
        value += current;
        index += 1;
      }
      if (!closed) throw syntaxError("字符串未闭合", start);
      tokens.push({ kind: "string", value, position: start });
      continue;
    }

    const numberMatch = source.slice(index).match(/^-?(?:\d+\.?\d*|\.\d+)/);
    if (numberMatch) {
      tokens.push({ kind: "number", value: numberMatch[0], position: index });
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (identifierMatch) {
      tokens.push({
        kind: "identifier",
        value: identifierMatch[0],
        position: index,
      });
      index += identifierMatch[0].length;
      continue;
    }

    throw syntaxError(`不支持的字符 ${JSON.stringify(char)}`, index);
  }

  tokens.push({ kind: "eof", value: "", position: source.length });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly input: unknown,
  ) {}

  parse(): boolean {
    const value = this.parseOr();
    const trailing = this.peek();
    if (trailing.kind !== "eof") {
      throw syntaxError(`不支持的语法 ${JSON.stringify(trailing.value)}`, trailing.position);
    }
    return Boolean(value);
  }

  private parseOr(): unknown {
    let left = this.parseAnd();
    while (this.match("||")) {
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseEquality();
    while (this.match("&&")) {
      const right = this.parseEquality();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseEquality(): unknown {
    let left = this.parseRelational();
    while (["===", "!==", "==", "!="].includes(this.peek().value)) {
      const operator = this.advance().value;
      const right = this.parseRelational();
      const equal = Object.is(left, right);
      left = operator === "!==" || operator === "!=" ? !equal : equal;
    }
    return left;
  }

  private parseRelational(): unknown {
    let left = this.parseUnary();
    while ([">", ">=", "<", "<="].includes(this.peek().value)) {
      const operator = this.advance().value;
      const right = this.parseUnary();
      if (
        !(
          (typeof left === "number" && typeof right === "number") ||
          (typeof left === "string" && typeof right === "string")
        )
      ) {
        left = false;
        continue;
      }
      const comparableLeft = left;
      const comparableRight = right;
      if (typeof comparableLeft === "number" && typeof comparableRight === "number") {
        if (operator === ">") left = comparableLeft > comparableRight;
        if (operator === ">=") left = comparableLeft >= comparableRight;
        if (operator === "<") left = comparableLeft < comparableRight;
        if (operator === "<=") left = comparableLeft <= comparableRight;
      } else if (
        typeof comparableLeft === "string" &&
        typeof comparableRight === "string"
      ) {
        if (operator === ">") left = comparableLeft > comparableRight;
        if (operator === ">=") left = comparableLeft >= comparableRight;
        if (operator === "<") left = comparableLeft < comparableRight;
        if (operator === "<=") left = comparableLeft <= comparableRight;
      }
    }
    return left;
  }

  private parseUnary(): unknown {
    if (this.match("!")) return !Boolean(this.parseUnary());
    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
    const token = this.advance();
    if (token.kind === "number") return Number(token.value);
    if (token.kind === "string") return token.value;
    if (token.kind === "identifier") {
      if (token.value === "true") return true;
      if (token.value === "false") return false;
      if (token.value === "null") return null;
      if (token.value !== "input") {
        throw syntaxError(`只允许使用 input，收到 ${token.value}`, token.position);
      }
      return this.parseInputPath();
    }
    if (token.value === "(") {
      const value = this.parseOr();
      this.expect(")");
      return value;
    }
    throw syntaxError(`缺少值，收到 ${JSON.stringify(token.value)}`, token.position);
  }

  private parseInputPath(): unknown {
    let value = this.input;
    while (this.match(".")) {
      const property = this.advance();
      if (property.kind !== "identifier") {
        throw syntaxError("点号后必须是属性名", property.position);
      }
      if (UNSAFE_PROPERTIES.has(property.value)) {
        throw syntaxError(`禁止访问属性 ${property.value}`, property.position);
      }
      if ((typeof value !== "object" && typeof value !== "function") || value === null) {
        value = undefined;
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, property.value);
      value = descriptor && "value" in descriptor ? descriptor.value : undefined;
    }
    return value;
  }

  private expect(value: string): void {
    const token = this.advance();
    if (token.value !== value) {
      throw syntaxError(`期望 ${value}，收到 ${JSON.stringify(token.value)}`, token.position);
    }
  }

  private match(value: string): boolean {
    if (this.peek().value !== value) return false;
    this.index += 1;
    return true;
  }

  private peek(): Token {
    return this.tokens[this.index]!;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== "eof") this.index += 1;
    return token;
  }
}

export function evaluateCondition(expression: string, input: unknown): boolean {
  return new Parser(tokenize(expression), input).parse();
}
