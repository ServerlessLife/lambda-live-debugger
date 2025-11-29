provider "aws" {
  region = "eu-west-1"
}

terraform {
  backend "s3" {
    key     = "terraform.tfstate"
    region  = "eu-west-1"
    encrypt = true
  }
}

resource "aws_iam_role" "lambda_role" {
  name = "lld-terraform-basic-lambda_execution_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "random_string" "random" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket" "deploy_bucket" {
  bucket = "lld-terraform-basic-deploy-${random_string.random.result}"
}

// services/testJsCommonJs/lambda.js #1
data "archive_file" "test-js-commonjs_1_zip" {
  type        = "zip"
  source_file = "services/testJsCommonJs/lambda.js"
  output_path = "${path.module}/dist/test-js-commonjs_1.zip"
}

resource "aws_s3_object" "test-js-commonjs_1_zip" {
  bucket = aws_s3_bucket.deploy_bucket.id
  key    = "test-js-commonjs_1.zip"
  source = data.archive_file.test-js-commonjs_1_zip.output_path
  etag   = data.archive_file.test-js-commonjs_1_zip.output_md5
}

resource "aws_lambda_function" "test-js-commonjs_1" {
  function_name = "lld-terraform-basic-test-js-commonjs_1"
  handler       = "lambda.lambdaHandler"
  runtime       = "nodejs24.x"

  s3_bucket = aws_s3_object.test-js-commonjs_1_zip.bucket
  s3_key    = aws_s3_object.test-js-commonjs_1_zip.key

  source_code_hash = data.archive_file.test-js-commonjs_1_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
}

// services/testJsCommonJs/lambda.js #2
data "archive_file" "test-js-commonjs_2_zip" {
  type        = "zip"
  source_dir  = "services/testJsCommonJs"
  output_path = "${path.module}/dist/test-js-commonjs_2.zip"
}

resource "aws_s3_object" "test-js-commonjs_2_zip" {
  bucket = aws_s3_bucket.deploy_bucket.id
  key    = "test-js-commonjs_2.zip"
  source = data.archive_file.test-js-commonjs_2_zip.output_path
  etag   = data.archive_file.test-js-commonjs_2_zip.output_md5
}

resource "aws_lambda_function" "test-js-commonjs_2" {
  function_name = "lld-terraform-basic-test-js-commonjs_2"
  handler       = "lambda.lambdaHandler"
  runtime       = "nodejs24.x"

  s3_bucket = aws_s3_object.test-js-commonjs_2_zip.bucket
  s3_key    = aws_s3_object.test-js-commonjs_2_zip.key

  source_code_hash = data.archive_file.test-js-commonjs_2_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
}

module "test-js-commonjs_3" {
  source = "terraform-aws-modules/lambda/aws"

  function_name = "lld-terraform-basic-test-js-commonjs_3"
  handler       = "lambda.lambdaHandler"
  runtime       = "nodejs24.x"

  source_path = "services/testJsCommonJs"
}

// services/testJsEsModule/lambda.js
data "archive_file" "test-js-esmodule_zip" {
  type        = "zip"
  source_dir  = "services/testJsEsModule"
  output_path = "${path.module}/dist/test-js-esmodule.zip"
}

resource "aws_s3_object" "test-js-esmodule_zip" {
  bucket = aws_s3_bucket.deploy_bucket.id
  key    = "test-js-esmodule.zip"
  source = data.archive_file.test-js-esmodule_zip.output_path
  etag   = data.archive_file.test-js-esmodule_zip.output_md5
}

resource "aws_lambda_function" "test-js-esmodule" {
  function_name = "lld-terraform-basic-test-js-esmodule"
  handler       = "lambda.lambdaHandler"
  runtime       = "nodejs24.x"

  s3_bucket = aws_s3_object.test-js-esmodule_zip.bucket
  s3_key    = aws_s3_object.test-js-esmodule_zip.key

  source_code_hash = data.archive_file.test-js-esmodule_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
}

// services/testTsEsModule/dist/lambda.js
data "archive_file" "test-ts-esmodule_zip" {
  type        = "zip"
  source_dir  = "services/testTsEsModule/dist"
  output_path = "${path.module}/dist/test-ts-esmodule.zip"
}

resource "aws_s3_object" "test-ts-esmodule_zip" {
  bucket = aws_s3_bucket.deploy_bucket.id
  key    = "test-ts-esmodule.zip"
  source = data.archive_file.test-ts-esmodule_zip.output_path
  etag   = data.archive_file.test-ts-esmodule_zip.output_md5
}

resource "aws_lambda_function" "test-ts-esmodule" {
  function_name = "lld-terraform-basic-test-ts-esmodule"
  handler       = "lambda.lambdaHandler"
  runtime       = "nodejs24.x"

  s3_bucket = aws_s3_object.test-ts-esmodule_zip.bucket
  s3_key    = aws_s3_object.test-ts-esmodule_zip.key

  source_code_hash = data.archive_file.test-ts-esmodule_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
}

// services/testTsCommonJs/dist/lambda.js
data "archive_file" "test-ts-commonjs_zip" {
  type        = "zip"
  source_dir  = "services/testTsCommonJs/dist"
  output_path = "${path.module}/dist/test-ts-commonjs.zip"
}

resource "aws_s3_object" "test-ts-commonjs_zip" {
  bucket = aws_s3_bucket.deploy_bucket.id
  key    = "test-ts-commonjs.zip"
  source = data.archive_file.test-ts-commonjs_zip.output_path
  etag   = data.archive_file.test-ts-commonjs_zip.output_md5
}

resource "aws_lambda_function" "test-ts-commonjs" {
  function_name = "lld-terraform-basic-test-ts-commonjs"
  handler       = "lambda.lambdaHandler"
  runtime       = "nodejs24.x"

  s3_bucket = aws_s3_object.test-ts-commonjs_zip.bucket
  s3_key    = aws_s3_object.test-ts-commonjs_zip.key

  source_code_hash = data.archive_file.test-ts-commonjs_zip.output_base64sha256
  role             = aws_iam_role.lambda_role.arn
}

output "lambda-test-js-commonjs_1_name" {
  value = aws_lambda_function.test-js-commonjs_1.function_name
}

output "lambda-test-js-commonjs_2_name" {
  value = aws_lambda_function.test-js-commonjs_2.function_name
}

output "lambda-test-js-commonjs_3_name" {
  value = module.test-js-commonjs_3.lambda_function_name
}

output "lambda-test-js-esmodule_name" {
  value = aws_lambda_function.test-js-esmodule.function_name
}

output "lambda-test-ts-esmodule_name" {
  value = aws_lambda_function.test-ts-esmodule.function_name
}

output "lambda-test-ts-commonjs_name" {
  value = aws_lambda_function.test-ts-commonjs.function_name
}
