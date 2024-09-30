#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
// @ts-ignore
import { CdkEsmStack } from '../lib/cdk-esm-stack';
// @ts-ignore
import { CdkEsmStack2 } from '../lib/subfolder/cdk-esm-stack2';

const app = new cdk.App();

const environment = 'test';

new CdkEsmStack(app, 'CdkEsmStack', {
  stackName: `${environment}-lld-cdk-esm`,
});

new CdkEsmStack2(app, 'CdkEsmStack2', {
  stackName: `${environment}-lld-cdk-esm2`,
});
