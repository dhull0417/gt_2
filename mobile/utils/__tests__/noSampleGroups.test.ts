// Sample groups were removed (2026-11-25): nothing in the app can create one.
import { groupApi } from '../api';

it('the app has no way to create a sample group', () => {
  expect('createDemoGroup' in groupApi).toBe(false);
});
