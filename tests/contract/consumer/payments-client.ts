// The consumer's own HTTP client (e.g. what a checkout web/BFF ships).
// The Pact consumer test exercises THIS code, not hand-written HTTP calls.

export interface CreatePaymentRequest {
  userId: string;
  amount: number;
  currency: string;
  paymentMethodToken: string;
}

export interface CreatePaymentResponse {
  paymentId: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  amount: number;
  currency: string;
}

export class PaymentsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentsApiError';
  }
}

export class PaymentsClient {
  constructor(private readonly baseUrl: string) {}

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    });
    const body = (await response.json()) as { error?: { code?: string; message?: string } };

    if (!response.ok) {
      throw new PaymentsApiError(response.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? '');
    }
    return body as CreatePaymentResponse;
  }
}
