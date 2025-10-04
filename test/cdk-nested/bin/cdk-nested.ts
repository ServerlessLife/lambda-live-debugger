#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkNestedStack } from '../lib/cdk-nested-stack';

if (process.env.CDK_DEFAULT_REGION !== 'eu-west-1') {
  // checking if the region is set with Lambda Live Debugger
  throw new Error('CDK_DEFAULT_REGION must be set to eu-west-1');
}

const app = new cdk.App();

const environment = app.node.tryGetContext('environment');

if (!environment) {
  throw new Error('Environment is not set in the context');
}

new CdkNestedStack(app, 'CdkNesetedStack', {
  stackName: `${environment}-lld-cdk-nested`,
});
