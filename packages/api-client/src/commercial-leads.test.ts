import { describe, expect, it, vi } from 'vitest';
import { createApiClient, createPublicCommercialLeadsApiClient } from './index';

const lead = {
  id: '31037f86-8dc4-4e4f-a066-c21428b82395',
  opportunityType: 'PLANNER_AGENCY' as const,
  contactName: 'María López',
  businessName: 'Eventos Aurora',
  email: 'maria@aurora.mx',
  phone: '+525512345678',
  estimatedEventsPerMonth: 4,
  notes: null,
  privacyAcceptedAt: '2026-08-28T12:00:00.000Z',
  createdAt: '2026-08-28T12:00:00.000Z'
};

describe('commercial leads API clients', () => {
  it('posts the public submission with omitted credentials', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ accepted: true }));
    const input = {
      submissionId: '79806bc4-c303-4377-a664-bd0f95e5b72c',
      opportunityType: 'PLANNER_AGENCY' as const,
      contactName: 'María López',
      businessName: 'Eventos Aurora',
      email: 'maria@aurora.mx',
      phone: null,
      estimatedEventsPerMonth: null,
      notes: null,
      privacyAccepted: true as const,
      website: ''
    };

    await createPublicCommercialLeadsApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).submit(input);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/public/commercial-leads',
      expect.objectContaining({ method: 'POST', credentials: 'omit', body: JSON.stringify(input) })
    );
  });

  it('lists and gets administrative leads with encoded filters and path', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [lead], nextCursor: 'next' }))
      .mockResolvedValueOnce(jsonResponse(lead));
    const client = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });

    await client.adminCommercialLeads.list({ opportunityType: 'PLANNER_AGENCY', limit: 25, cursor: 'a/b' });
    await client.adminCommercialLeads.get('id/with/slash');

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/api/v1/admin/commercial-leads?opportunityType=PLANNER_AGENCY&cursor=a%2Fb&limit=25',
      'https://api.example.com/api/v1/admin/commercial-leads/id%2Fwith%2Fslash'
    ]);
  });

  it('rejects malformed public, list and detail responses', async () => {
    const publicClient = createPublicCommercialLeadsApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ accepted: true, leadId: lead.id }))
    });
    const adminClient = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ ...lead, submissionId: lead.id }))
    });

    await expect(
      publicClient.submit({
        submissionId: lead.id,
        opportunityType: 'VENUE',
        contactName: 'Ana Mora',
        businessName: 'Venue Norte',
        email: 'ana@example.com',
        privacyAccepted: true
      })
    ).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
    await expect(adminClient.adminCommercialLeads.get(lead.id)).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
    await expect(adminClient.adminCommercialLeads.list()).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}
