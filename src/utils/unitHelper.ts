/**
 * 将表示数据大小的字符串（如 '1.5MB', '128*1024gb'）转换为字节数。
 * @param str - 输入的字符串。
 * @returns - 计算出的字节数（number）。如果无法解析，则返回 0。
 * @example
 * stringToBytes('1MB');        // 1048576
 * stringToBytes('1 MB');        // 1048576
 * stringToBytes('5.4MB');      // 5662310.4
 * stringToBytes('6,222,765 MB'); // 6525139624935
 * stringToBytes('128*1024gb'); // 140737488355328
 * stringToBytes('1e3kb');       // 1024000 (1000 * 1024)
 * stringToBytes('0.2gb');       // 214748364.8
 * stringToBytes('1024');        // 1024 (默认为字节)
 * stringToBytes('1tb');         // 1099511627776
 */
export function stringToBytes(str: string): number {
  if (typeof str !== "string" || str.length === 0 || str.length > 256) {
    return 0;
  }
  // 定义单位和它们的字节倍数 (使用 1024 为基数)
  const units: { [key: string]: number } = {
    b: 1,
    byte: 1,
    bytes: 1,
    k: 1024,
    kb: 1024,
    kib: 1024,
    kilobyte: 1024,
    m: 1024 ** 2,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    megabyte: 1024 ** 2,
    g: 1024 ** 3,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    gigabyte: 1024 ** 3,
    t: 1024 ** 4,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
    terabyte: 1024 ** 4,
    p: 1024 ** 5,
    pb: 1024 ** 5,
    pib: 1024 ** 5,
    petabyte: 1024 ** 5,
  };

  // 1. 预处理字符串：转小写，移除逗号和空格
  const cleanStr = str.toLowerCase().replace(/,/g, "").replace(/\s/g, "");
  if (!cleanStr) return 0;

  // 2. 分离单位和数值
  // 按长度降序排序单位，以优先匹配长单位（如 'kb' 而不是 'b'）
  const unitKeys = Object.keys(units).sort((a, b) => b.length - a.length);
  const unitRegex = new RegExp(`(${unitKeys.join("|")})$`);

  let unit = "b"; // 默认为 byte
  let numericPart = cleanStr;

  const match = cleanStr.match(unitRegex);
  if (match) {
    unit = match[1];
    // 从字符串中移除单位，得到纯数值部分
    numericPart = cleanStr.substring(0, cleanStr.length - unit.length);
  }

  // 如果数值部分为空（例如输入 "kb"），则认为数值是 1
  if (numericPart === "") {
    numericPart = "1";
  }

  try {
    // 3. 只解析有限的数字、科学记数法、括号和四则运算，不执行 JavaScript。
    const value = parseByteExpression(numericPart);
    const bytes = Math.round(value * units[unit]);
    return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : 0;
  } catch {
    // 编辑中的不完整表达式与无效输入均沿用 0 的返回约定。
    return 0;
  }
}

function parseByteExpression(source: string): number {
  let position = 0;
  const fail = (): never => { throw new Error("Invalid byte expression"); };
  const finite = (value: number) => Number.isFinite(value) ? value : fail();
  const factor = (depth: number): number => {
    if (depth > 32) return fail();
    const next = source[position];
    if (next === "+" || next === "-") {
      position++;
      const value = factor(depth + 1);
      return next === "-" ? -value : value;
    }
    if (next === "(") {
      position++;
      const value = expression(depth + 1);
      if (source[position++] !== ")") return fail();
      return value;
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/.exec(source.slice(position));
    if (!match) return fail();
    position += match[0].length;
    return finite(Number(match[0]));
  };
  const term = (depth: number): number => {
    let value = factor(depth);
    while (source[position] === "*" || source[position] === "/") {
      const operator = source[position++];
      const right = factor(depth);
      value = finite(operator === "*" ? value * right : value / right);
    }
    return value;
  };
  const expression = (depth: number): number => {
    let value = term(depth);
    while (source[position] === "+" || source[position] === "-") {
      const operator = source[position++];
      const right = term(depth);
      value = finite(operator === "+" ? value + right : value - right);
    }
    return value;
  };
  const result = expression(0);
  return position === source.length ? result : fail();
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  if (unitIndex === 0) {
    // 单位为B，不显示小数
    return `${Math.round(size)} ${units[unitIndex]}`;
  } else if (unitIndex >= 2 && bytes >= 1024**3) {
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  } else if (size > 99.99) {
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  } else {
    // 小于等于两位数，显示2位小数
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}
