/**
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * This code was copied from:
 * https://github.com/aws/aws-lambda-nodejs-runtime-interface-client
 *
 */

"use strict";

const EnvVarName = "AWS_LAMBDA_RUNTIME_VERBOSE";
const Tag = "RUNTIME";
const Verbosity = (() => {
  if (!process.env[EnvVarName]) {
    return 0;
  }

  try {
    const verbosity = parseInt(process.env[EnvVarName]);
    return verbosity < 0 ? 0 : verbosity > 3 ? 3 : verbosity;
  } catch (_) {
    return 0;
  }
})();

exports.logger = function (category) {
  return {
    verbose: function () {
      if (Verbosity >= 1) {
        const args = [...arguments].map((arg) =>
          typeof arg === "function" ? arg() : arg,
        );
        console.log.apply(null, [Tag, category, ...args]);
      }
    },
    vverbose: function () {
      if (Verbosity >= 2) {
        const args = [...arguments].map((arg) =>
          typeof arg === "function" ? arg() : arg,
        );
        console.log.apply(null, [Tag, category, ...args]);
      }
    },
    vvverbose: function () {
      if (Verbosity >= 3) {
        const args = [...arguments].map((arg) =>
          typeof arg === "function" ? arg() : arg,
        );
        console.log.apply(null, [Tag, category, ...args]);
      }
    },
  };
};
