/**
 * Split a message into chunks of 50k characters.
 * @param input The message to split.
 * @returns The message chunks.
 */
export function splitMessageToChunks(input: any) {
  const id = Math.random().toString();
  const json = JSON.stringify(input);

  // split string into 50k chunks.
  const parts = [];
  const partSize = 50000;
  for (let i = 0; i < json.length; i += partSize) {
    parts.push(json.substring(i, i + partSize));
  }

  if (!parts) return [];
  const fragments = parts.map(
    (part, index) =>
      <MessageChunk>{
        id,
        index,
        count: parts?.length,
        data: part,
      }
  );

  return fragments;
}

export interface MessageChunk {
  id: string;
  index: number;
  count: number;
  data: string;
}
