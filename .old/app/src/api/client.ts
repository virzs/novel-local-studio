import { API_BASE } from '../lib/api';

/**
 * 统一的 API 请求错误。
 *
 * 当后端返回非 2xx 状态码时抛出，包含可直接展示的错误信息与 HTTP 状态码。
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {};
  if (extraHeaders) {
    Object.assign(headers, extraHeaders as Record<string, string>);
  }

  let serializedBody: BodyInit | undefined;
  if (body !== undefined) {
    if (typeof body === 'object' && body !== null && !(body instanceof FormData) && !(body instanceof Blob)) {
      headers['Content-Type'] = 'application/json';
      serializedBody = JSON.stringify(body);
    } else {
      serializedBody = body as BodyInit;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: serializedBody,
  });

  let data: unknown;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  }

  if (!res.ok) {
    const errMsg =
      (data as { error?: string } | undefined)?.error ??
      `请求失败 (${res.status})`;
    throw new ApiError(errMsg, res.status);
  }

  return data as T;
}

/**
 * 统一的前端 API 请求客户端。
 *
 * 封装了项目内所有基础请求能力：
 * - 自动拼接 `API_BASE`
 * - 普通对象 body 自动序列化为 JSON
 * - 自动解析 JSON 响应
 * - 非 2xx 状态统一抛出 `ApiError`
 */
export const apiClient = {
  /**
   * 发起 GET 请求。
   *
   * @param path 相对 API 路径
   * @param options 原生 fetch 选项（不含 body）
   */
  get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' });
  },
  /**
   * 发起 POST 请求。
   *
   * @param path 相对 API 路径
   * @param body 请求体，普通对象会自动转为 JSON
   * @param options 原生 fetch 选项（不含 body）
   */
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', body });
  },
  /**
   * 发起 PUT 请求。
   *
   * @param path 相对 API 路径
   * @param body 请求体，普通对象会自动转为 JSON
   * @param options 原生 fetch 选项（不含 body）
   */
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>(path, { ...options, method: 'PUT', body });
  },
  /**
   * 发起 DELETE 请求。
   *
   * @param path 相对 API 路径
   * @param options 原生 fetch 选项（不含 body）
   */
  delete<T = void>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' });
  },
};
