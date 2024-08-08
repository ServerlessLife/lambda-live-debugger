// @ts-ignore
import { type LldConfigTs } from 'lambda-live-debugger';

export default {
  framework: 'cdk',
  context: ['e=1', 'e=2', 'e=3', 'e=4'],
  observable: false,
  verbose: false,
  //getLambdas: async (foundLambdas, config) => {
  //  you can customize the list of lambdas here or create your own
  //  return foundLambdas;
  //},
} satisfies LldConfigTs;
