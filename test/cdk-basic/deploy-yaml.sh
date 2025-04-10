# This script is used to deploy the CDK stack using a YAML template.
npx cdk synth -c environment=test CdkbasicStack > CdkbasicStack.yaml
# Add a dummy resource to the template to force a change in the stack
awk '
  /^Resources:/ && !injected {
    print
    print "  DummyForceResource:"
    print "    Type: AWS::CloudFormation::WaitConditionHandle"
    print "    Properties: {}"
    injected=1
    next
  }
  { print }
' CdkbasicStack.yaml > template.patched.yaml && mv template.patched.yaml CdkbasicStack.yaml
aws cloudformation deploy --template-file CdkbasicStack.yaml --stack-name test-lld-cdk-basic --capabilities CAPABILITY_NAMED_IAM