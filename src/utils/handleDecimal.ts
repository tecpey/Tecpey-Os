function decimalPipe(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function handleDecimal(price: string | number): string {
  const num = Number(price);

  if (num > 1) {
    return decimalPipe(num, 2);
  }

  const str = num.toString();
  const dotIndex = str.indexOf(".");

  if (dotIndex === -1) {
    return decimalPipe(num, 2);
  }

  const decimalPart = str.slice(dotIndex + 1);

  let zeroCount = 0;

  for (const char of decimalPart) {
    if (char === "0") {
      zeroCount++;
    } else {
      break;
    }
  }

  return decimalPipe(num, zeroCount + 3);
}