export function getSamplePayload(lambdaName: any) {
  const now = new Date().toISOString();
  const payload = {
    lambdaName: lambdaName,
    timestamp: now,
  };
  return payload;
}
