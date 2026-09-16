import React, { createContext, useContext, useState } from 'react';

const OfflineBannerHeightContext = createContext<{
  height: number;
  setHeight: (height: number) => void;
}>({ height: 0, setHeight: () => {} });

export function OfflineBannerHeightProvider({ children }: { children: React.ReactNode }) {
  const [height, setHeight] = useState(0);
  return (
    <OfflineBannerHeightContext.Provider value={{ height, setHeight }}>
      {children}
    </OfflineBannerHeightContext.Provider>
  );
}

export function useOfflineBannerHeight(): number {
  return useContext(OfflineBannerHeightContext).height;
}

export function useSetOfflineBannerHeight(): (height: number) => void {
  return useContext(OfflineBannerHeightContext).setHeight;
}
