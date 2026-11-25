import React, { createContext, useContext, useMemo } from 'react';

// Tells first-visit tours to wait: true while something else is taking over the screen on the
// tabs (the welcome video, the "add your name" prompt). Provided by app/_layout.tsx. Outside a
// provider nothing blocks, so screens and tests without one behave as before.
const TourGateContext = createContext<{ blocked: boolean }>({ blocked: false });

export function TourGateProvider({ blocked, children }: { blocked: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ blocked }), [blocked]);
  return <TourGateContext.Provider value={value}>{children}</TourGateContext.Provider>;
}

export const useTourGate = () => useContext(TourGateContext);
