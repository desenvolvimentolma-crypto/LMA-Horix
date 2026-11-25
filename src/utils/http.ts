export async function parseJsonResponse<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.text();

  if (res.status === 404 && (!raw || !raw.trim() || contentType.includes('text/html'))) {
    throw new Error(
      'O servidor da API (/api) não respondeu neste endereço (erro 404). Verifique se o deploy incluiu a função serverless (netlify/functions/api) ou o servidor Node.'
    );
  }

  if (contentType.includes('text/html') || raw.trim().startsWith('<!doctype html')) {
    throw new Error(
      'A resposta retornou uma página HTML em vez da API (/api). Verifique se o servidor backend (server.ts) está em execução neste endereço.'
    );
  }

  if (!raw || !raw.trim()) {
    throw new Error(
      res.ok
        ? 'O servidor retornou uma resposta vazia. Tente novamente.'
        : `Não foi possível conectar ao servidor (erro ${res.status}). Tente novamente em instantes.`
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      res.ok
        ? 'Resposta inválida do servidor.'
        : `Erro de comunicação com o servidor (HTTP ${res.status}).`
    );
  }
}
