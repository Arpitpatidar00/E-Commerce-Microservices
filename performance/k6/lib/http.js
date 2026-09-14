import http from 'k6/http';

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

export function get(endpoint, params = {}) {
  const url = `${BASE_URL}${endpoint}`;
  return http.get(url, params);
}

export function post(endpoint, payload, params = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const defaultParams = {
    headers: { 'Content-Type': 'application/json' },
    ...params,
  };
  return http.post(url, JSON.stringify(payload), defaultParams);
}
