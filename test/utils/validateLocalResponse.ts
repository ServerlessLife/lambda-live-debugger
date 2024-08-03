import { expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { setTimeout } from "timers/promises";

export async function validateLocalResponse(
  lambdaName: any,
  payload: { lambdaName: any; timestamp: string },
) {
  // Initial wait for 1 second
  await setTimeout(1000);

  const filePath = path.resolve(
    __dirname,
    `../local_lambda_responses/${lambdaName}.json`,
  );

  let responseFile;
  const maxRetries = 7; // Try for 7 seconds
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      responseFile = await fs.readFile(filePath, "utf-8");
      break; // If file is read successfully, exit the loop
    } catch (error: any) {
      if (error.code === "ENOENT" && attempt < maxRetries) {
        await setTimeout(1000); // Wait 1 second before retrying
      } else {
        throw error; // If it's not a file-not-found error or retries are exhausted, throw the error
      }
    }
  }

  if (!responseFile) {
    throw new Error(`File not found after ${maxRetries} seconds`);
  }

  const response = JSON.parse(responseFile);
  expect(response.inputEvent).toEqual(payload);
  expect(response.runningLocally).toEqual(true);

  // remove the file
  //await fs.unlink(filePath);
}
