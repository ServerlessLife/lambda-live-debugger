import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as log from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

export class CdkbasicStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const functionTestTsCommonJs = new lambda_nodejs.NodejsFunction(
      this,
      'TestTsCommonJs',
      {
        // a different way to get the path
        entry: path.join(__dirname, '../services/testTsCommonJs/lambda.ts'),
        handler: 'lambdaHandler',
        runtime: lambda.Runtime.NODEJS_22_X,
        logRetention: log.RetentionDays.ONE_DAY,
      },
    );

    const functionTestTsEsModule = new lambda_nodejs.NodejsFunction(
      this,
      'TestTsEsModule',
      {
        entry: 'services/testTsEsModule/lambda.ts',
        handler: 'lambdaHandler',
        runtime: lambda.Runtime.NODEJS_22_X,
        bundling: {
          format: lambda_nodejs.OutputFormat.ESM,
        },
        logRetention: log.RetentionDays.ONE_DAY,
      },
    );

    const functionTestJsCommonJs = new lambda_nodejs.NodejsFunction(
      this,
      'TestJsCommonJs',
      {
        entry: 'services/testJsCommonJs/lambda.js',
        handler: 'lambdaHandler',
        runtime: lambda.Runtime.NODEJS_22_X,
        logRetention: log.RetentionDays.ONE_DAY,
      },
    );

    new cdk.CfnOutput(this, 'FunctionNameTestTsCommonJs', {
      value: functionTestTsCommonJs.functionName,
    });

    new cdk.CfnOutput(this, 'FunctionNameTestTsEsModule', {
      value: functionTestTsEsModule.functionName,
    });

    new cdk.CfnOutput(this, 'FunctionNameTestJsCommonJs', {
      value: functionTestJsCommonJs.functionName,
    });
  }
}
