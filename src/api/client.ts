import createClient from "openapi-fetch";
import type { paths } from "./garage.d";

declare global {
  interface Window {
    __GARAGE_CONFIG__?: { apiUrl?: string; adminToken?: string };
  }
}

const TOKEN_KEY = "garage_admin_token";
const BASE_URL_KEY = "garage_base_url";

function runtimeConfig() {
  return window.__GARAGE_CONFIG__ ?? {};
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? runtimeConfig().adminToken ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getBaseUrl(): string {
  return localStorage.getItem(BASE_URL_KEY) ?? runtimeConfig().apiUrl ?? "/api";
}

export function setBaseUrl(url: string): void {
  localStorage.setItem(BASE_URL_KEY, url);
}

export function clearCredentials(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(BASE_URL_KEY);
}

export function createGarageClient() {
  const token = getToken();
  const baseUrl = getBaseUrl();
  return createClient<paths>({
    baseUrl,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

let _client = createGarageClient();

export function getClient() {
  return _client;
}

export function refreshClient() {
  _client = createGarageClient();
}
