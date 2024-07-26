/**
 * Remove undefined properties from an object
 * @param obj
 * @returns
 */
export function removeUndefinedProperties(obj: any) {
  if (!obj) {
    return obj;
  }

  for (const key in obj) {
    if (typeof (obj as any)[key] === "undefined") {
      delete (obj as any)[key];
    }
  }

  return obj;
}
