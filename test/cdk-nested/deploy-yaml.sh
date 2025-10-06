# This script is used to deploy the CDK stack using a YAML template.
npx cdk synth -c environment=test CdkNestedStack > CdkbasicStack.yaml

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
' CdkNestedStack.yaml > template.patched.yaml

# Cdk synth sometimes generates a dummy notification line at the top of the file.
# Remove the first part of the template up to and including the Resources section
awk 'f{print} /^Resources:/ {f=1; print}' template.patched.yaml | awk '/\[cdk:skip\]/{exit} {print}' > CdkNestedStack.yaml

echo "Deploying stack with the following template:"
echo "-------------------------------------------"
cat CdkNestedStack.yaml
echo "-------------------------------------------"

aws cloudformation deploy --template-file CdkNestedStack.yaml --stack-name test-lld-cdk-nested --capabilities CAPABILITY_NAMED_IAM
