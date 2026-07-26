export class TFile {}
export async function requestUrl(options: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ text: string; json: unknown; status: number; headers: Headers }> {
  const response = await fetch(options.url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body,
  });
  const text = await response.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${options.url}`) as Error & {
      status?: number;
      response?: { status: number; headers: Headers };
    };
    error.status = response.status;
    error.response = { status: response.status, headers: response.headers };
    throw error;
  }
  return { text, json, status: response.status, headers: response.headers };
}
