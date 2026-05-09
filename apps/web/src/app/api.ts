export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, opts);
  const text = await res.text();
  let json: ({ error?: string } & T) | null = null;

  if (text) {
    try {
      json = JSON.parse(text) as { error?: string } & T;
    } catch {
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      throw new Error(`Invalid JSON response from ${path}`);
    }
  }

  if (!res.ok) throw new Error(json?.error ?? (text || `HTTP ${res.status}`));
  if (!json) throw new Error(`Empty response from ${path}`);
  return json;
}
