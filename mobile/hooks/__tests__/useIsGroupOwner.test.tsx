import { renderHook } from '@testing-library/react-native';
import { useIsGroupOwner } from '../useIsGroupOwner';

let mockMe: { _id: string } | undefined = { _id: 'u1' };
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: mockMe }) }));
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true }) }));
jest.mock('@/utils/api', () => ({ useApiClient: () => ({}), userApi: { getCurrentUser: jest.fn() } }));

describe('useIsGroupOwner', () => {
  beforeEach(() => { mockMe = { _id: 'u1' }; });

  it('is true when the owner id (string) is me', async () => {
    const { result } = await renderHook(() => useIsGroupOwner('u1'));
    expect(result.current).toBe(true);
  });
  it('is true when the populated owner is me', async () => {
    const { result } = await renderHook(() => useIsGroupOwner({ _id: 'u1' }));
    expect(result.current).toBe(true);
  });
  it('is false for someone else, or no owner', async () => {
    expect((await renderHook(() => useIsGroupOwner('u2'))).result.current).toBe(false);
    expect((await renderHook(() => useIsGroupOwner(undefined))).result.current).toBe(false);
    expect((await renderHook(() => useIsGroupOwner(null))).result.current).toBe(false);
  });
  it('is false while I am still loading', async () => {
    mockMe = undefined;
    const { result } = await renderHook(() => useIsGroupOwner('u1'));
    expect(result.current).toBe(false);
  });
});
