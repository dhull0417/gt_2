import { renderHook } from '@testing-library/react-native';
import { useIssueScroll } from '../useIssueScroll';

it('scrolls to a registered section, a little above it', async () => {
  const scrollTo = jest.fn();
  const ref = { current: { scrollTo } } as any;
  const { result } = await renderHook(() => useIssueScroll(ref));
  result.current.register('when', 'timezone')({ nativeEvent: { layout: { y: 300 } } } as any);
  result.current.scrollTo('timezone');
  expect(scrollTo).toHaveBeenCalledWith({ y: 284, animated: true });
  result.current.scrollTo('bring');
  result.current.scrollTo(null);
  expect(scrollTo).toHaveBeenCalledTimes(1);
});
