export async function request(path, { method = 'GET', data } = {}) {
  const response = await fetch(path, {
    method,
    ...(data === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.message || 'The request failed.'), { status: response.status });
  return body;
}
