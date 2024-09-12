import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as log from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import * as url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export class CdkEsmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const functionTestTsEsModule = new lambda_nodejs.NodejsFunction(
      this,
      'TestTsEsModule',
      {
        entry: path.resolve(__dirname, '../services/testTsEsModule/lambda.ts'),
        handler: 'lambdaHandler',
        runtime: lambda.Runtime.NODEJS_20_X,
        environment: {
          NODE_OPTIONS: '--enable-source-maps',
          LOG_LEVEL: 'DEBUG',
        },
        bundling: {
          minify: true,
          sourceMap: true,
          externalModules: [],
          platform: 'node',
          // ESM important properties:
          mainFields: ['module', 'main'],
          format: lambda_nodejs.OutputFormat.ESM,
          banner:
            "const require = (await import('node:module')).createRequire(import.meta.url);",
        },
        logRetention: log.RetentionDays.ONE_DAY,
      },
    );

    new cdk.CfnOutput(this, 'FunctionNameTestTsEsModule', {
      value: functionTestTsEsModule.functionName,
    });
  }
}
