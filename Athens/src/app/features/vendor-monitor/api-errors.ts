type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export function formatVendorMonitorError(err: unknown, source: string, fallback: string): string {
  if (err instanceof TypeError && /fetch|network|failed/i.test(err.message)) {
    return `Cannot reach athens-server. Is it running on port 8979?`;
  }
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: ApiErrorPayload }).data;
    const apiError = data?.error || data?.message;
    if (apiError) {
      if (/cloud mongo|mongo_cloud|bid records database not ready for cloud/i.test(apiError)) {
        return `Cloud bid records unavailable: ${apiError}. Check MONGO_CLOUD_URL in Athens-server/.env and restart athens-server.`;
      }
      return apiError;
    }
    const status = (err as { status?: number }).status;
    if (status === 503) {
      return `Bid records database not ready for ${source}. Check MONGO_CLOUD_URL (cloud) or local MongoDB, then restart athens-server.`;
    }
  }
  return fallback;
}
