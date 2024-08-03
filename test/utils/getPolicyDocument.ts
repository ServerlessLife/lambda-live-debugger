import { GetRolePolicyCommand, IAMClient } from "@aws-sdk/client-iam";

export const iamClient = new IAMClient({});

export async function getPolicyDocument(roleArn: string | undefined) {
  try {
    const roleName = roleArn!.split("/").pop();

    const policy = await iamClient.send(
      new GetRolePolicyCommand({
        RoleName: roleName,
        PolicyName: "LambdaLiveDebuggerPolicy",
      }),
    );

    if (policy.PolicyDocument) {
      const policyDocument = JSON.parse(
        decodeURIComponent(policy.PolicyDocument),
      );
      return policyDocument;
    } else {
      return undefined;
    }
  } catch (error: any) {
    if (error.name === "NoSuchEntityException") {
      return undefined;
    } else {
      throw error;
    }
  }
}
