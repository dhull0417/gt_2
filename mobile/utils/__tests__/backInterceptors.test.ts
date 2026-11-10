import { pushBackInterceptor, runBackInterceptor } from '../backInterceptors';

describe('backInterceptors', () => {
  it('returns false when nothing is registered', () => {
    expect(runBackInterceptor()).toBe(false);
  });

  it('runs the newest interceptor only and reports it ran', () => {
    const older = jest.fn();
    const newer = jest.fn();
    const offOlder = pushBackInterceptor(older);
    const offNewer = pushBackInterceptor(newer);
    expect(runBackInterceptor()).toBe(true);
    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
    offNewer();
    offOlder();
  });

  it('stops intercepting once unregistered', () => {
    const fn = jest.fn();
    const off = pushBackInterceptor(fn);
    off();
    expect(runBackInterceptor()).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('removing an older one leaves the newer one active', () => {
    const older = jest.fn();
    const newer = jest.fn();
    const offOlder = pushBackInterceptor(older);
    const offNewer = pushBackInterceptor(newer);
    offOlder();
    expect(runBackInterceptor()).toBe(true);
    expect(newer).toHaveBeenCalledTimes(1);
    offNewer();
    offNewer(); // double unregister is harmless
    expect(runBackInterceptor()).toBe(false);
  });
});
