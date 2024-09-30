import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as log from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import * as url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export class CdkEsmStack2 extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //testJsEsModule
    const functionTestJsEsModule = new lambda_nodejs.NodejsFunction(
      this,
      'TestJsEsModule',
      {
        entry: path.join(__dirname, '../../services/testJsEsModule/lambda.js'),
        handler: 'lambdaHandler',
        runtime: lambda.Runtime.NODEJS_20_X,
        bundling: {
          format: lambda_nodejs.OutputFormat.ESM,
        },
        logRetention: log.RetentionDays.ONE_DAY,
      },
    );

    const functionTestJsCommonJsBase = new lambda.Function(
      this,
      'TestJsCommonJsBase',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'lambda.lambdaHandler',
        code: lambda.Code.fromAsset('services/testJsCommonJs'),
        logRetention: log.RetentionDays.ONE_DAY,
      },
    );

    const functionTestJsEsModuleBase = new lambda.Function(
      this,
      'TestJsEsModuleBase',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'lambda.lambdaHandler',
        code: lambda.Code.fromAsset('services/testJsEsModule'),
        logRetention: log.RetentionDays.ONE_DAY,
      },
    );

    new cdk.CfnOutput(this, 'FunctionNameTestJsEsModule', {
      value: functionTestJsEsModule.functionName,
    });

    new cdk.CfnOutput(this, 'FunctionNameTestJsCommonJsBase', {
      value: functionTestJsCommonJsBase.functionName,
    });

    new cdk.CfnOutput(this, 'FunctionNameTestJsEsModuleBase', {
      value: functionTestJsEsModuleBase.functionName,
    });
  }
}
