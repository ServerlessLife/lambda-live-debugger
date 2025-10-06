import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LLDNestedStack } from './lld-nested-stack';

export class CdkNestedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    new LLDNestedStack(this, 'nested-stack');
  }
}
