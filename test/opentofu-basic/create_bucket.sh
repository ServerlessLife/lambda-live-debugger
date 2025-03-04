#!/bin/bash

# Check if a bucket name was provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <bucket-name>"
    exit 1
fi

# Variables
BUCKET_NAME="$1"
REGION="eu-west-1"

# Check if the S3 bucket exists
if aws s3 ls "s3://$BUCKET_NAME" 2>&1 | grep -q 'NoSuchBucket'
then
    echo "Bucket does not exist, creating..."
    # Create the S3 bucket
    aws s3 mb s3://$BUCKET_NAME --region $REGION
    # Enable versioning (optional)
    aws s3api put-bucket-versioning --bucket $BUCKET_NAME --versioning-configuration Status=Enabled
    echo "Bucket created and versioning enabled."
else
    echo "Bucket already exists."
fi
