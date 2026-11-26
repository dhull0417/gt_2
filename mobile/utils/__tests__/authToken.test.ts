import { setClerkTokenGetter, waitForClerkToken } from '../authToken';

describe('waitForClerkToken', () => {
  afterEach(() => setClerkTokenGetter(null));

  it('waits for sign-in to hand over the token getter, then returns its token', async () => {
    const pending = waitForClerkToken(undefined, 1000);
    setTimeout(() => setClerkTokenGetter(async () => 'tok'), 50);
    await expect(pending).resolves.toBe('tok');
  });

  it('passes the token options through (the supabase template)', async () => {
    const getter = jest.fn(async (o?: { template?: string }) => o?.template ?? 'default');
    setClerkTokenGetter(getter);
    await expect(waitForClerkToken({ template: 'supabase' })).resolves.toBe('supabase');
  });

  it('gives up with null if sign-in never arrives', async () => {
    await expect(waitForClerkToken(undefined, 50)).resolves.toBeNull();
  });
});
