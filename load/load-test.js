// k6 load test: baseline -> spike -> recovery on POST /api/v1/payments.
//
//   k6 run load/load-test.js
//   k6 run -e PROFILE=smoke load/load-test.js
//   k6 run -e BASE_URL=http://host.docker.internal:3000 load/load-test.js
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween, uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PROFILE = __ENV.PROFILE || 'spike';
const CURRENCIES = ['USD', 'EUR', 'GBP'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const paymentCompleted = new Rate('payment_completed_rate');
const paymentLatency = new Trend('payment_create_latency', true);
const serverErrors = new Counter('payment_5xx_total');

const PROFILES = {
  smoke: [
    { duration: '10s', target: 2 },
    { duration: '20s', target: 2 },
    { duration: '5s', target: 0 },
  ],
  spike: [
    { duration: '30s', target: 10 }, // warm-up
    { duration: '1m', target: 10 }, // baseline
    { duration: '10s', target: 100 }, // SPIKE: 10x in 10 seconds
    { duration: '1m', target: 100 }, // hold the spike
    { duration: '10s', target: 10 }, // drop back
    { duration: '30s', target: 10 }, // recovery: latency should return to baseline
    { duration: '10s', target: 0 }, // ramp down
  ],
};

export const options = {
  scenarios: {
    payment_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: PROFILES[PROFILE] || PROFILES.spike,
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:create_payment}': ['p(95)<500', 'p(99)<1000'],
    payment_completed_rate: ['rate>0.99'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    fail(`Payments service is not healthy at ${BASE_URL} (status ${res.status})`);
  }
}

function safeJson(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

export default function () {
  const payload = {
    userId: `load_user_${randomIntBetween(1, 5000)}`,
    amount: randomIntBetween(100, 100000) / 100, // 1.00 .. 1000.00
    currency: CURRENCIES[randomIntBetween(0, CURRENCIES.length - 1)],
    paymentMethodToken: `tok_${uuidv4().replace(/-/g, '')}`,
  };

  const res = http.post(`${BASE_URL}/api/v1/payments`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'create_payment' },
  });
  const body = safeJson(res);

  const ok = check(res, {
    'status is 201': (r) => r.status === 201,
    'payment is COMPLETED': () => body !== null && body.status === 'COMPLETED',
    'paymentId is a UUID': () => body !== null && UUID_RE.test(body.paymentId),
    'amount echoed back': () => body !== null && body.amount === payload.amount,
  });

  paymentCompleted.add(ok);
  paymentLatency.add(res.timings.duration);
  if (res.status >= 500) serverErrors.add(1);

  sleep(randomIntBetween(100, 500) / 1000); // think time
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    [__ENV.SUMMARY_PATH || 'load-summary.json']: JSON.stringify(data, null, 2),
  };
}
