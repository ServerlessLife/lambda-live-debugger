/**
 * Combine two objects with string values into one object with string values.
 * @param a
 * @param b
 * @returns
 */
export function combineObjectStrings<T>(a: T, b: T): T {
  if (!a && !b) {
    return {} as T;
  }
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }

  // for each propety merge string and seperate with /n
  const result = { ...a };
  for (const key in b) {
    if (result[key]) {
      (result as any)[key] = `${result[key]}\n${b[key]}`;
    } else {
      result[key] = b[key];
    }
  }
  return result;
}
