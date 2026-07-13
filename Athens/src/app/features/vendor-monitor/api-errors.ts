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
      if (/bid records database not ready for local|local mongo/i.test(apiError)) {
        return `Main bid records unavailable: ${apiError}. Check local MongoDB and restart athens-server.`;
      }
      if (/cloud mongo|mongo_cloud|bid records database not ready for cloud/i.test(apiError)) {
        return `Cloud bid records unavailable: ${apiError}. Check MONGO_CLOUD_URL in Athens-server/.env and restart athens-server.`;
      }
      return apiError;
    }
    const status = (err as { status?: number }).status;
    if (status === 503) {
      return source === "local"
        ? `Bid records database not ready. Check local MongoDB, then restart athens-server.`
        : `Bid records database not ready for cloud. Check MONGO_CLOUD_URL, then restart athens-server.`;
    }
  }
  return fallback;
}
