import crypto from 'crypto';
import { IoTMessage, IoTService } from '../ioTService.js';
import { Logger } from '../logger.js';

const workerId = crypto.randomBytes(16).toString('hex');
const topic = `${process.env.LLD_DEBUGGER_ID}/events/${workerId}`;

const ORIGINAL_HANDLER_KEY = 'ORIGINAL_HANDLER';
const observableInterval = process.env.LLD_OBSERVABLE_INTERVAL
  ? parseInt(process.env.LLD_OBSERVABLE_INTERVAL!)
  : 0;
let lastObservableInvoke: number | undefined;

if (process.env.LLD_VERBOSE === 'true') {
  Logger.setVerbose(true);
  // verbose logging for handler interceptor
  process.env.AWS_LAMBDA_RUNTIME_VERBOSE = '3';
}

/**
 * A handler replacement that sends the event to the IoT service
 */
export async function handler(event: any, context: any) {
  if (process.env.LLD_OBSERVABLE_MODE === 'true') {
    return await observableMode(context, event);
  } else {
    return await regularMode(context, event);
  }
}

/**
 * Regular mode, which waits for the debugger to respond
 */
async function regularMode(context: any, event: any) {
  let promiseResolve: (value: any) => void;
  let promiseReject: (reason: any) => void;

  const promise = new Promise<any>((resolve, reject) => {
    promiseResolve = resolve;
    promiseReject = reject;
  });

  const timeout = setTimeout(() => {
    promiseResolve({
      statusCode: 500,
      body: "The function's in live debug mode but it hasn't heard back from your machine yet. If this is the first time you're trying out Lambda Live Debugger on this AWS account, AWS might need around 10 minutes to get everything ready. Hang tight and check back in a bit!",
    });
  }, 5 * 1000);

  const ioTService = await IoTService.connect({
    onMessage: async (message: IoTMessage) => {
      Logger.log('IoT message', message);

      if (message.type === 'PING') {
        if (message.data.workerId === workerId) {
          Logger.log('Pinged by the debugger');
          // Pinged by the debugger, so we know the debugger is alive
          clearTimeout(timeout);
        }
      }

      if (['SUCCESS', 'ERROR'].includes(message.type)) {
        if (message.data.workerId === workerId) {
          clearTimeout(timeout);
        }
      }

      if (message.type === 'SUCCESS') {
        promiseResolve(message.data.body);
      }

      if (message.type === 'ERROR') {
        const error = new Error(message.data.errorMessage);
        error.stack = message.data.trace;
        promiseReject(error);
      }
    },
    topic,
  });

  const payload: IoTMessage = {
    type: 'INVOKE',
    data: {
      workerId: workerId,
      requestId: context.awsRequestId,
      functionId: process.env.LLD_FUNCTION_ID as string,
      deadline: context.getRemainingTimeInMillis(),
      event,
      context,
      env: process.env,
    },
  };
  Logger.log(
    'Publishing to IoT',
    `${process.env.LLD_DEBUGGER_ID}/events`,
    payload,
  );
  await ioTService.publish(payload, `${process.env.LLD_DEBUGGER_ID}/events`);

  return promise;
}

/**
 * Observable mode, which sends the event to the IoT service and doesn't wait for a response. It executes the original handler.
 */
async function observableMode(context: any, event: any) {
  const regularHandler = async () => {
    const handler = await getOriginalHandler();
    return await handler(event, context);
  };

  const observableHandler = async () => {
    // prevent sending too many events
    if (observableInterval > 0) {
      if (lastObservableInvoke) {
        const diff = Date.now() - lastObservableInvoke;
        if (diff < observableInterval) {
          // Skipping, because the interval is not reached yet
          return;
        }
      }
      lastObservableInvoke = Date.now();
    }

    const ioTService = await IoTService.connect();

    const payload: IoTMessage = {
      type: 'INVOKE',
      data: {
        workerId: workerId,
        requestId: context.awsRequestId,
        functionId: process.env.LLD_FUNCTION_ID as string,
        deadline: context.getRemainingTimeInMillis(),
        event,
        context,
        env: process.env,
      },
    };
    Logger.log(
      'Publishing to IoT',
      `${process.env.LLD_DEBUGGER_ID}/events`,
      payload,
    );
    await ioTService.publish(payload, `${process.env.LLD_DEBUGGER_ID}/events`);
  };

  const regularHandlerPromise = regularHandler();

  const observableHandlerPromise = observableHandler();

  await observableHandlerPromise;
  const response = await regularHandlerPromise;
  return response;
}

async function getOriginalHandler(): Promise<any> {
  // @ts-ignore
  const { load } = await import('./aws/UserFunction');

  if (process.env[ORIGINAL_HANDLER_KEY] === undefined)
    throw Error('Missing original handler');
  return load(
    process.env.LAMBDA_TASK_ROOT!,
    process.env[ORIGINAL_HANDLER_KEY],
  ) as Promise<any>;
}
