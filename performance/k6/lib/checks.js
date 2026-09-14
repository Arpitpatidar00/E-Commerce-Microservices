import { check } from 'k6';

export function isSuccess(response) {
  return check(response, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });
}

export function isWithinSLA(response, ms = 500) {
  return check(response, {
    'latency within SLA': (r) => r.timings.duration < ms,
  });
}

export function checkResponse(response, name = 'request') {
  isSuccess(response);
  isWithinSLA(response);
}
