import { CfnOutput, NestedStack, NestedStackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as log from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

export class LLDNestedNestedStack extends NestedStack {
  constructor(scope: Construct, id: string, props?: NestedStackProps) {
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

    new CfnOutput(
      this.nestedStackParent!.nestedStackParent!,
      'FunctionNameTestTsCommonJsNested',
      {
        value: functionTestTsCommonJs.functionName,
      },
    );

    new CfnOutput(
      this.nestedStackParent!.nestedStackParent!,
      'FunctionNameTestTsEsModuleNested',
      {
        value: functionTestTsEsModule.functionName,
      },
    );

    new CfnOutput(
      this.nestedStackParent!.nestedStackParent!,
      'FunctionNameTestJsCommonJsNested',
      {
        value: functionTestJsCommonJs.functionName,
      },
    );
  }
}
