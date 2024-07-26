import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";

export class CdkbasicStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const functionTestTsCommonJs = new lambda_nodejs.NodejsFunction(
      this,
      "TestTsCommonJs",
      {
        entry: "services/testTsCommonJs/lambda.ts",
        handler: "lambdaHandler",
        runtime: lambda.Runtime.NODEJS_20_X,
      }
    );

    const functionTestTsEsModule = new lambda_nodejs.NodejsFunction(
      this,
      "TestTsEsModule",
      {
        entry: "services/testTsEsModule/lambda.ts",
        handler: "lambdaHandler",
        runtime: lambda.Runtime.NODEJS_20_X,
        bundling: {
          format: lambda_nodejs.OutputFormat.ESM,
        },
      }
    );

    const functionTestJsCommonJs = new lambda_nodejs.NodejsFunction(
      this,
      "TestJsCommonJs",
      {
        entry: "services/testJsCommonJs/lambda.js",
        handler: "lambdaHandler",
        runtime: lambda.Runtime.NODEJS_20_X,
      }
    );

    //testJsEsModule
    const functionTestJsEsModule = new lambda_nodejs.NodejsFunction(
      this,
      "TestJsEsModule",
      {
        entry: "services/testJsEsModule/lambda.js",
        handler: "lambdaHandler",
        runtime: lambda.Runtime.NODEJS_20_X,
        bundling: {
          format: lambda_nodejs.OutputFormat.ESM,
        },
      }
    );

    const functionTestJsCommonJsBase = new lambda.Function(
      this,
      "TestJsCommonJsBase",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "lambda.lambdaHandler",
        code: lambda.Code.fromAsset("services/testJsCommonJs"),
      }
    );

    const functionTestJsEsModuleBase = new lambda.Function(
      this,
      "TestJsEsModuleBase",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "lambda.lambdaHandler",
        code: lambda.Code.fromAsset("services/testJsEsModule"),
      }
    );

    new cdk.CfnOutput(this, "FunctionNameTestTsCommonJs", {
      value: functionTestTsCommonJs.functionName,
    });

    new cdk.CfnOutput(this, "FunctionNameTestTsEsModule", {
      value: functionTestTsEsModule.functionName,
    });

    new cdk.CfnOutput(this, "FunctionNameTestJsCommonJs", {
      value: functionTestJsCommonJs.functionName,
    });

    new cdk.CfnOutput(this, "FunctionNameTestJsEsModule", {
      value: functionTestJsEsModule.functionName,
    });

    new cdk.CfnOutput(this, "FunctionNameTestJsCommonJsBase", {
      value: functionTestJsCommonJsBase.functionName,
    });

    new cdk.CfnOutput(this, "FunctionNameTestJsEsModuleBase", {
      value: functionTestJsEsModuleBase.functionName,
    });
  }
}
