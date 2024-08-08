import * as path from 'path';
import * as fs from 'fs/promises';
import { FuctionRequest } from './ioTService.js';
import { NodeEsBuild } from './nodeEsBuild.js';
import { NodeWorker } from './nodeWorker.js';

/**
 * Build the Lambda function
 * @param functionId
 * @returns
 */
async function buildLambda(functionId: string) {
  const artifactFile = await NodeEsBuild.getBuild(functionId);

  try {
    await fs.access(artifactFile!, fs.constants.F_OK);
  } catch {
    throw new Error(
      `${functionId} function artifact file ${artifactFile} not found.`,
    );
  }

  return {
    artifactFile: path.resolve(artifactFile!),
  };
}

/**
 * Invoke the local handler
 * @param input
 * @returns
 */
async function invokeLocalHandler(input: {
  artifactFile: string;
  fuctionRequest: FuctionRequest;
}) {
  return await NodeWorker.runInWorker({
    artifactFile: input.artifactFile,
    fuctionRequest: input.fuctionRequest,
    environment: input.fuctionRequest.env,
  });
}

/**
 * Invoke a Lambda function locally
 * @param fuctionRequest
 * @returns
 */
async function invokeLambda(fuctionRequest: FuctionRequest): Promise<any> {
  // Build the Lambda function if needed
  const artifact = await buildLambda(fuctionRequest.functionId);

  // Invoke the Lambda function
  return await invokeLocalHandler({
    artifactFile: artifact.artifactFile,
    fuctionRequest: fuctionRequest,
  });
}

export const NodeHandler = {
  invokeLambda,
};
