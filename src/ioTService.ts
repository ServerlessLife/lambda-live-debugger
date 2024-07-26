import * as iot from "aws-iot-device-sdk";
import { splitMessageToChunks, MessageChunk } from "./utils/splitIoTMessage.js";
import { IoTClient, DescribeEndpointCommand } from "@aws-sdk/client-iot";
import type {
  AwsCredentialIdentityProvider,
  AwsCredentialIdentity,
} from "@smithy/types";

let device: iot.device;

const chunks = new Map<string, Map<number, MessageChunk>>();

type IoTMessageBase = {
  workerId: string;
  requestId: string;
  functionId: string;
};

export type FuctionRequest = {
  deadline: number;
  event: any;
  context: any;
  env: {
    [key: string]: string | undefined;
  };
} & IoTMessageBase;

export type FunctionResponse = {
  body: any;
} & IoTMessageBase;

export type FunctionErrorResponse = {
  errorType: string;
  errorMessage: string;
  trace?: string;
} & IoTMessageBase;

export type FunctionPing = IoTMessageBase;

/**
 * IoT Message that is exchanged between the Lambda and local worker
 */
export type IoTMessage =
  | {
      type: "INVOKE";
      data: FuctionRequest;
    }
  | {
      type: "SUCCESS";
      data: FunctionResponse;
    }
  | {
      type: "ERROR";
      data: FunctionErrorResponse;
    }
  | {
      type: "PING";
      data: FunctionPing;
    };

export type IoTMessageTypes = IoTMessage["type"];

/**
 * Get IoT endpoint
 * @param param0
 * @returns
 */
async function getIoTEndpoint({
  region,
  credentials,
}: {
  region?: string;
  credentials?: AwsCredentialIdentity;
}) {
  const iot = new IoTClient({
    region,
    credentials,
  });
  const response = await iot.send(
    new DescribeEndpointCommand({
      endpointType: "iot:Data-ATS",
    })
  );

  if (!response.endpointAddress)
    throw new Error("IoT Endpoint address not found");

  return response.endpointAddress;
}

let connectedPromiseResolve: () => void;

const connectedPromise = new Promise<void>((resolve) => {
  connectedPromiseResolve = resolve;
});

/**
 * IoT Service Connection with an method to publish messages
 */
export type IoTServiceConnection = {
  publish: (payload: IoTMessage, topic: string) => Promise<void>;
};

/**
 * Connect to IoT
 * @param props
 * @returns
 */
async function connect(props?: {
  onMessage?: (message: IoTMessage) => void;
  topic?: string;
  region?: string;
  credentialsProvider?: AwsCredentialIdentityProvider;
}): Promise<IoTServiceConnection> {
  const credentials = props?.credentialsProvider
    ? await props.credentialsProvider()
    : undefined;

  const endpoint = await getIoTEndpoint({
    region: props?.region,
    credentials,
  });

  device = new iot.device({
    protocol: "wss",
    host: endpoint,
    reconnectPeriod: 1,
    keepalive: 60,
    region: props?.region,
    accessKeyId: credentials?.accessKeyId,
    secretKey: credentials?.secretAccessKey,
    sessionToken: credentials?.sessionToken,
  });

  if (props?.topic) {
    device.subscribe(props.topic, { qos: 1 });
    console.debug("Subscribed to topic ", props.topic);
  }

  device.on("connect", () => {
    console.debug("IoT connected");
    connectedPromiseResolve();
  });

  device.on("error", (err) => {
    console.debug("IoT error", err);
  });

  device.on("close", () => {
    console.debug("IoT closed");
  });

  device.on("reconnect", () => {
    console.debug("IoT reconnecting...");
  });

  if (props?.onMessage) {
    const messageReceived = (topic: string, buffer: Buffer) => {
      const chunk = JSON.parse(buffer.toString());

      if (!chunk.id) {
        throw new Error("Invalid fragment");
      }

      let pending = chunks.get(chunk.id);
      if (!pending) {
        pending = new Map();
        chunks.set(chunk.id, pending);
      }
      pending.set(chunk.index, chunk);

      if (pending.size === chunk.count) {
        const data = [...pending.values()]
          .sort((a, b) => a.index - b.index)
          .map((item) => item.data)
          .join("");
        chunks.delete(chunk.id);
        const evt = JSON.parse(data);
        props.onMessage!(evt);
      }
    };

    device.on("message", messageReceived);
  }

  return {
    publish: async (payload, topic) => {
      await connectedPromise;
      for (const fragment of splitMessageToChunks(payload)) {
        await new Promise<void>((r) => {
          device.publish(
            topic,
            JSON.stringify(fragment),
            {
              qos: 1,
            },
            () => {
              r();
            }
          );
        });
      }
    },
  };
}

export const IoTService = {
  connect,
};
