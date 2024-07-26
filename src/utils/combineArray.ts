/**
 * Combines two arrays into one array.
 * @param a
 * @param b
 * @returns
 */
export function combineArray<T>(
  a: T[] | undefined,
  b: T[] | undefined
): T[] | undefined {
  if (!a && !b) {
    return undefined;
  }
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }

  return [...a, ...b];
}
