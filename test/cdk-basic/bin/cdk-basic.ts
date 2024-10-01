#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkbasicStack } from '../lib/cdk-basic-stack';
import { CdkbasicStack2 } from '../lib/subfolder/cdk-basic-stack2';

const app = new cdk.App();

const environment = app.node.tryGetContext('environment');

if (!environment) {
  throw new Error('Environment is not set in the context');
}

new CdkbasicStack(app, 'CdkbasicStack', {
  stackName: `${environment}-lld-cdk-basic`,
});

new CdkbasicStack2(app, 'CdkbasicStack2', {
  stackName: `${environment}-lld-cdk-basic2`,
});
