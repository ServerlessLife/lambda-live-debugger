/**
 * Run async tasks with a limited number of tasks running concurrently,
 * for example to avoid hitting AWS API rate limits.
 * @param tasks
 * @param limit
 * @returns results in the same order as the tasks
 */
export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number = 5,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let nextTaskIndex = 0;

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (nextTaskIndex < tasks.length) {
        const taskIndex = nextTaskIndex++;
        results[taskIndex] = await tasks[taskIndex]();
      }
    },
  );

  await Promise.all(workers);
  return results;
}
