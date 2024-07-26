import { LambdaResource } from "./resourcesDiscovery.js";

export type LambdaProps = {
  functionId: string;
} & LambdaResource;
