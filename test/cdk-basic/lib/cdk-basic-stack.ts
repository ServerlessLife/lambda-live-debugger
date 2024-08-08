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
        runtime: lambda.Runtime.NODEJS_20_X,
        logRetention: log.RetentionDays.ONE_DAY,
      },
    );

    const functionTestTsEsModule = new lambda_nodejs.NodejsFunction(
      this,
      'TestTsEsModule',
      {
        entry: 'services/testTsEsModule/lambda.ts',
        handler: 'lambdaHandler',
        runtime: lambda.Runtime.NODEJS_20_X,
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
        runtime: lambda.Runtime.NODEJS_20_X,
        logRetention: log.RetentionDays.ONE_DAY,
      },
    );

    //testJsEsModule
    const functionTestJsEsModule = new lambda_nodejs.NodejsFunction(
      this,
      'TestJsEsModule',
      {
        entry: 'services/testJsEsModule/lambda.js',
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

    new cdk.CfnOutput(this, 'FunctionNameTestTsCommonJs', {
      value: functionTestTsCommonJs.functionName,
    });

    new cdk.CfnOutput(this, 'FunctionNameTestTsEsModule', {
      value: functionTestTsEsModule.functionName,
    });

    new cdk.CfnOutput(this, 'FunctionNameTestJsCommonJs', {
      value: functionTestJsCommonJs.functionName,
    });

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
