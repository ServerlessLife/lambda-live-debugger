# Lambda Live Debugger

![Logo](logo.png)

Lambda Live Debugger is an indispensable tool for debugging AWS Lambda functions from your computer, even though they are deployed in the cloud. It supports Lambdas written in JavaScript or TypeScript.

This tool offers similar functionality to [SST](https://sst.dev/) and [Serverless Framework v4](https://www.serverless.com/blog/serverless-framework-v4-general-availability), with the addition of an Observability mode.

It supports the following frameworks:

- AWS CDK v2
- Serverless Framework v3 (SLS)
- AWS Serverless Application Model (SAM)
- Terraform
- Any other framework or setup by implementing a simple function in TypeScript
- ... (Need support for another framework? Let me know!)

## Early Alpha State

**This project is in the early alpha stage. Your feedback is incredibly valuable. Please let me know if it works for you or if you encounter any issues. I've tested many scenarios, but people can configure their projects and TypeScript settings in numerous ways. The tool is flexible and can be adjusted to fit your setup in most cases without needing additional features. If you need help, please let me know. Any suggestions for improvements are welcome.**

Contact me via:

- [GitHub Issues](https://github.com/ServerlessLife/lambda-live-debugger/issues)
- [LinkedIn](http://www.linkedin.com/in/marko-serverlesslife)

## The Problem Statement

Serverless is amazing and solves many issues with traditional systems. However, writing code for Lambda functions can be challenging. The cycle of writing, deploying, running, fixing, and redeploying is time-consuming and tedious. While local testing tools and unit/integration tests exist, they often don't replicate the actual environment closely enough.

## How It Works

Lambda Live Debugger connects to your deployed Lambda, routes requests to your computer, and sends responses back to the Lambda. This allows you to debug locally, but the system behaves as if the code is running in the cloud with the same permissions.

The tool attaches Lambda Extensions (via a Layer) to intercept and relay calls to AWS IoT, transferring messages between your Lambda and local machine. If the Lambda is written in TypeScript, it's transpiled to JavaScript. The code is executed via Node Worker Thread.

![Architecture](./architecture.drawio.png)

### Infrastructure Changes

Lambda Live Debugger makes the following changes to your AWS infrastructure:

- Adds Lambda Layer
- Attaches the Layer to each Lambda you're debugging
- Adds a policy to the Lambda Role for AWS IoT access

In case you do not want to debug all functions and add Layer to them, you can limit to the ones you need via the `function` parameter.

The tool generates temporary files in the `.lldebugger` folder, which can be deleted after debugging. The wizard can add `.lldebugger` to `.gitignore` for you.

## Development Process

Since you deploy code to a real AWS account, it's best to have a dedicated environment only for yourself. It could be your personal environment or an environment created for a feature. That is [common practice when developing serverless systems](https://theburningmonk.com/2019/09/why-you-should-use-temporary-stacks-when-you-do-serverless/). If that's not feasible due to organizational or technical reasons, use Observability Mode.

## Observability Mode

In Observability Mode, Lambda Live Debugger intercepts requests and sends them to your computer without waiting for a response. The Lambda continues as usual. The response from your machine is ignored. This mode can be used in the development, testing, or even, if you are an adventurous, production environment. It samples requests every 3 seconds by default (configurable with an `interval` setting) to avoid overloading the system.

## Getting Started

### Installation

Install locally:

```
npm install lambda-live-debugger
```

or globally

```
npm install lambda-live-debugger -g
```

(On Linux and Mac: `sudo npm install lambda-live-debugger -g`)

Running the Tool

With default profile, region, and other default settings:

```
lld
```

or if installed locally:

```
npx lld
```

But you probably need to tweak some settings. You can do it via CLI parameters or, better, run a wizard:

```
lld -w
```

or if installed locally:

```
npx lld -w
```

The configuration is saved to `lldebugger.config.ts`

### CLI Parameters

```
 -V, --version                   output the version number
 -r, --remove [option]           Remove Lambda Live Debugger infrastructure. Options: 'keep-layer' (default), 'remove-all'. The latest also removes the Lambda Layer
 -w, --wizard                    Program interactively asks for each parameter and saves it to lldebugger.config.ts
 -v, --verbose                   Verbose logs
 -c, --context <context>         AWS CDK context (default: [])
 -s, --stage <stage>             Serverless Framework stage
 -f, --function <function name>  Filter by function name. You can use * as a wildcard
 -m, --subfolder <subfolder>     Monorepo subfolder
 -o, --observable                Observable mode
 -i --interval <interval>        Observable mode interval (default: "3000")
 --config-env <evironment>       SAM environment
 --profile <profile>             AWS profile to use
 --region <region>               AWS region to use
 --role <role>                   AWS role to use
 --framework <framework>         Framework to use (cdk, sls, sam, terraform)
 --gitignore                     Add .lldebugger to .gitignore
 -h, --help                      display help for command
```

### Debugging

You might want to configure your development tool for debugging. The wizard automatically configures for VsCode in `.vscode/launch.json`. Here is an example:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Lambda Live Debugger",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/lld",
      "runtimeArgs": [],
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"],
      "env": {}
    }
  ]
}
```

For other tools, please send documentation to include here. WebStorm instructions are especially needed.

## Monorepo Setup

Set the `subfolder` parameter if your framework is in a subfolder.

## Custom Configuration

getLambdas: async (foundLambdas) => {
//you can customize the list of lambdas here or create your own
//return foundLambdas;
},

## Removing

To remove Lambda Live Debugger from your AWS account

```
lld -r
```

or if installed locally:

```
npx lld -r
```

This detaches the Layer from your Lambdas and removes the IoT permission policy. It will not remove the Layer as others might use it.

To also remove the Layer:

```
lld -r=all
```

or if installed locally:

```
npx lld -r=all
```

## Framework-Specific Notes

### AWS CDK v2

Use the `context` parameter to pass context to your CDK code. This is a common way to pass variables to your code, most often the environment name.

### Serverless Framework v3 (SLS)

Use the `stage` parameter to pass the stage/environment name.

### AWS Serverless Application Model (SAM)

Use the `config-env` parameter to pass the stage/environment name.

### Terraform

Only the basic setup is supported. Check the [test case](https://github.com/ServerlessLife/lambda-live-debugger/tree/main/test/terraform-basic).

I am not a Terraform developer, so I only know the basics. Please provide a sample project so I can build better support.

## Know issues

...

## Missing Features

Check the [open issues](https://github.com/ServerlessLife/lambda-live-debugger/issues). The biggest missing feature right now is MFA authentication and more Terraform configurations.

## Reporting an Issue

- Make sure the bug hasn't already been reported. Add a "+1" comment so I know there are multiple users struggling with the same issue. If possible, add some additional info.
- Use descriptive titles with prefixes like "bug:", "help:", "feature:", or "discussion:". Please also add the matching label and, if needed, set priority via a label.
- Enable verbose logging and provide the full log.
- Describe your setup in detail, or better yet, provide a sample project.

## Authors:

- [Marko (ServerlessLife)](https://github.com/ServerlessLife)
- ⭐ Your name here for big code contributions

## Contributors (alphabetical)

- ⭐ Your name here for smaller code/documentation contributions or sample projects as part of bug reports

## Declarment

Lambda Live Debugger is provided "as is", without warranty of any kind, express or implied. Use it at your own risk, and be mindful of potential impacts on performance, security, and costs when using it in your AWS environment.
