type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export function formatVendorMonitorError(err: unknown, fallback: string): string {
  if (err instanceof TypeError && /fetch|network|failed/i.test(err.message)) {
    return `Cannot reach athens-server. Is it running on port 8979?`;
  }
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: ApiErrorPayload }).data;
    const apiError = data?.error || data?.message;
    if (apiError) {
      if (/bid records database not ready|local mongo/i.test(apiError)) {
        return `Main bid records unavailable: ${apiError}. Check local MongoDB and restart athens-server.`;
      }
      return apiError;
    }
    const status = (err as { status?: number }).status;
    if (status === 503) {
      return `Bid records database not ready. Check local MongoDB, then restart athens-server.`;
    }
  }
  return fallback;
}
