import createClient from "openapi-fetch";
import type { paths } from "./garage.d";

declare global {
  interface Window {
    __GARAGE_CONFIG__?: { apiUrl?: string; adminToken?: string };
  }
}

const TOKEN_KEY = "garage_admin_token";
const BASE_URL_KEY = "garage_base_url";

/** Abort a request that hangs longer than this (ms). */
const REQUEST_TIMEOUT_MS = 30_000;

function runtimeConfig() {
  return window.__GARAGE_CONFIG__ ?? {};
}

/** Strip trailing slashes so `baseUrl + "/v2/..."` never doubles up. */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "") || "/api";
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? runtimeConfig().adminToken ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getBaseUrl(): string {
  return normalizeBaseUrl(localStorage.getItem(BASE_URL_KEY) ?? runtimeConfig().apiUrl ?? "/api");
}

export function setBaseUrl(url: string): void {
  localStorage.setItem(BASE_URL_KEY, url);
}

export function clearCredentials(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(BASE_URL_KEY);
}

/** fetch wrapper that applies a per-request timeout. */
function clientFetch(input: Request | string | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

function buildClient(baseUrl: string, token: string) {
  return createClient<paths>({
    baseUrl,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    fetch: clientFetch,
  });
}

export function createGarageClient() {
  return buildClient(getBaseUrl(), getToken());
}

let _client = createGarageClient();

export function getClient() {
  return _client;
}

export function refreshClient() {
  _client = createGarageClient();
}

/**
 * Error thrown by {@link unwrap} carrying the HTTP status so callers (and the
 * react-query retry policy) can distinguish auth failures from server errors.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Pull a human-readable message out of Garage's `{ code, message }` error body. */
function extractMessage(error: unknown): string | null {
  if (error == null) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string" && e.message) {
      return typeof e.code === "string" ? `${e.message} (${e.code})` : e.message;
    }
    if (typeof e.code === "string") return e.code;
  }
  return null;
}

/**
 * Await an openapi-fetch call and return its `data`, throwing a readable
 * {@link ApiError} on a non-OK response, a network failure, or a timeout.
 * Centralises the `if (error) throw …` boilerplate every hook used to repeat.
 */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await call;
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new ApiError("Request timed out — the Garage API did not respond.");
    }
    throw new ApiError(
      "Cannot reach the Garage admin API. Check the Base URL in Settings and that the server is running.",
    );
  }

  const { data, error, response } = result;
  if (error !== undefined || !response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new ApiError("Unauthorized — check your admin token in Settings.", status);
    }
    throw new ApiError(extractMessage(error) ?? `Request failed (HTTP ${status}).`, status);
  }
  return data as T;
}

/**
 * Verify a base URL + token combination by pinging cluster health. Used by the
 * Settings "Test Connection" button against the values currently in the form,
 * without mutating the active client.
 */
export async function testConnection(
  baseUrl: string,
  token: string,
): Promise<{ ok: boolean; message: string }> {
  const client = buildClient(normalizeBaseUrl(baseUrl), token.trim());
  try {
    const health = await unwrap(client.GET("/v2/GetClusterHealth"));
    return { ok: true, message: `Connected — cluster is ${health?.status ?? "reachable"}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
