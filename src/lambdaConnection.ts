import { AwsCredentials } from "./awsCredentials.js";
import { Configuration } from "./configuration.js";
import { IoTMessage, IoTService, IoTServiceConnection } from "./ioTService.js";
import { Logger } from "./logger.js";
import { NodeHandler } from "./nodeHandler.js";

let ioTServiceConnection: IoTServiceConnection;
let topic: string;
const lambdasProcessingObservableMode = new Set<string>();

/**
 * Connect to the IoT Service
 */
async function connect() {
  topic = `${Configuration.config.debuggerId}/events`;
  ioTServiceConnection = await IoTService.connect({
    onMessage: onMessageFromLambda,
    topic,
    region: Configuration.config.region,
    credentialsProvider: AwsCredentials.getCredentialsProvider({
      profile: Configuration.config.profile,
      region: Configuration.config.region,
      role: Configuration.config.role,
    }),
  });
}

/**
 * Handle incoming messages from the IoT Service
 * @param message IoT message
 */
async function onMessageFromLambda(message: IoTMessage) {
  if (!Configuration.config.observable) {
    //immediately respond to the ping message to confirm the local debugging is alive
    await ioTServiceConnection.publish(
      <IoTMessage>{
        type: "PING",
        data: {
          workerId: message.data.workerId,
          requestId: message.data.requestId,
          functionId: message.data.functionId,
        },
      },
      `${topic}/${message.data.workerId}`
    );
  }

  if (message.type !== "INVOKE") {
    throw new Error(`Unexpected message type: ${message.type}`);
  }

  try {
    if (Configuration.config.observable) {
      // if we are in observable mode, we don't want to process the same
      // worker at the same time
      if (lambdasProcessingObservableMode.has(message.data.functionId)) {
        return;
      }
      lambdasProcessingObservableMode.add(message.data.functionId);

      // waitX5 seconds then remove the worker from the processing list
      // so we can get new event every X seconds
      if (Configuration.config.interval > 0) {
        setTimeout(() => {
          lambdasProcessingObservableMode.delete(message.data.functionId);
        }, Configuration.config.interval);
      }
    }

    if (Configuration.config.verbose) {
      Logger.verbose(
        `[Function ${message.data.functionId}] response: `,
        JSON.stringify(message.data, null, 2)
      );
    } else {
      // first 50 characters of the response
      const requestPretty = message.data
        ? JSON.stringify(message.data).substring(0, 100)
        : "";
      Logger.log(
        `[Function ${message.data.functionId}] request: ${requestPretty}${requestPretty.length < 50 ? "" : "..."}`
      );
    }

    const response = await NodeHandler.invokeLambda(message.data);

    if (Configuration.config.verbose) {
      Logger.verbose(
        `[Function ${message.data.functionId}]  response: `,
        JSON.stringify(response, null, 2)
      );
    } else {
      // first 50 characters of the response
      const responsePretty = response
        ? JSON.stringify(response).substring(0, 100)
        : "";
      Logger.log(
        `[Function ${message.data.functionId}] response: ${responsePretty}${responsePretty.length < 50 ? "" : "..."}`
      );
    }

    if (Configuration.config.observable) {
      // if we are in observable mode, mark the worker as processed
      lambdasProcessingObservableMode.delete(message.data.functionId);
    }

    const payload: IoTMessage = {
      type: "SUCCESS",
      data: {
        functionId: message.data.functionId,
        requestId: message.data.requestId,
        workerId: message.data.workerId,
        body: response,
      },
    };

    if (!Configuration.config.observable) {
      await ioTServiceConnection.publish(
        payload,
        `${topic}/${message.data.workerId}`
      );
    }
  } catch (e: any) {
    Logger.error(`${message.data.functionId} error: `, e.errorMessage);

    const payload: IoTMessage = {
      type: "ERROR",
      data: {
        functionId: message.data.functionId,
        requestId: message.data.requestId,
        workerId: message.data.workerId,
        errorType: e.errorType,
        errorMessage: e.errorMessage,
        trace: e.trace,
      },
    };

    if (!Configuration.config.observable) {
      await ioTServiceConnection.publish(
        payload,
        `${topic}/${message.data.workerId}`
      );
    } else {
      // if we are in observable mode, mark the worker as processed
      lambdasProcessingObservableMode.delete(message.data.functionId);
    }
  }
}

export const LambdaConnection = {
  connect,
};
