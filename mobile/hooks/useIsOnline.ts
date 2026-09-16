import { useEffect, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';

export function useIsOnline() {
  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setIsOnline), []);
  return isOnline;
}
