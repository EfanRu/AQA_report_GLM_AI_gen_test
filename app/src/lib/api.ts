export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Запрос ${url} не удался: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Запрос ${url} не удался: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}
