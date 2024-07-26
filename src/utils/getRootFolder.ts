/**
 * Get the root folder from a list of folders
 * @param folders
 * @returns
 */
export function getRootFolder(folders: string[]): string {
  if (folders.length === 0) return "";

  // Sort folders to ensure the shortest and most nested folder is first
  folders.sort((a, b) => a.length - b.length);

  // Split the first folder to get its parts
  const rootParts = folders[0].split("/");

  // Iterate through the parts and check if all folders start with the same root
  for (let i = 1; i < rootParts.length; i++) {
    const currentRoot = rootParts.slice(0, i + 1).join("/");
    if (!folders.every((folder) => folder.startsWith(currentRoot))) {
      return rootParts.slice(0, i).join("/");
    }
  }

  return folders[0]; // If all folders have the same root
}
