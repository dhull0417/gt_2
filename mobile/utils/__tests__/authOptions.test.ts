import { authButtonOrder } from '../authOptions';

describe('authButtonOrder', () => {
  it('puts Apple first on iPhone, with phone under More options', () => {
    expect(authButtonOrder('ios')).toEqual({ primary: ['apple', 'google', 'email'], more: ['phone'] });
  });
  it('shows everything at once on Android, where Apple is not offered', () => {
    expect(authButtonOrder('android')).toEqual({ primary: ['google', 'email', 'phone'], more: [] });
  });
});
