import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCase, updateCaseStatus } from './api';

describe('services/api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updateCaseStatus calls PATCH /api/demo/cases/:id/status', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ success: true }),
    })) as unknown as typeof fetch;

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    await updateCaseStatus('case_123', 'review');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/demo/cases/case_123/status');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ status: 'review' }));
  });

  it('createCase posts to /api/demo/cases and returns data.case', async () => {
    const expectedCase = {
      id: 'case_999',
      caseNumber: 'CASE_DC_001',
      title: 'Test',
      city: 'Washington',
      state: 'DC',
      neighborhood: 'Georgetown',
      status: 'investigating',
      priority: 'Medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: 'Analyst Team',
    };

    const fetchMock = vi.fn(async () => ({
      json: async () => ({ success: true, case: expectedCase }),
    })) as unknown as typeof fetch;

    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    const result = await createCase({
      title: 'Test',
      neighborhood: 'Georgetown',
      city: 'Washington',
      state: 'DC',
      priority: 'Medium',
      description: 'desc',
      estimatedLoss: 123,
      assigneeId: 'user_001',
    });

    expect(result).toEqual(expectedCase);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/demo/cases');
    expect(init.method).toBe('POST');
  });
});

