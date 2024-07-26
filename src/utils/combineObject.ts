/**
 * Combine two objects into one. If both objects have the same key, the value of the second object will be used.
 * @param a
 * @param b
 * @returns
 */
export function combineObject<T>(a: T, b: T): T | undefined {
  if (!a && !b) {
    return undefined;
  }
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }

  return { ...a, ...b };
}
