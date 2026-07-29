export async function fetcher<T>(
  url: string,
  options?: RequestInit
): Promise<T> {

  const baseUrl = process.env.NEXT_PUBLIC_API_BACKEND_URL;

  const isFormData = options?.body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options?.headers as Record<string, string>),
  };

  if (!isFormData &&
      options?.method &&
    options.method !== "GET"
  ) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || "API request failed");
  }

  return data;
}
