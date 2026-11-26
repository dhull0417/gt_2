import React, { createContext, useContext, useMemo } from 'react';

type TourEvent = 'started' | 'ended';
type Gate = {
  /** True while something else is taking over the screen on the tabs (the name prompt, the
   *  can't-load screen): first-visit tours wait. */
  blocked: boolean;
  /** Tours report when they start and end, so the root layout can sequence the first run
   *  (the Meetups tour, then account setup; see utils/firstRun.ts). */
  reportTour: (key: string, event: TourEvent) => void;
};

// Provided by app/_layout.tsx. Outside a provider nothing blocks and reports go nowhere, so screens
// and tests without one behave as before.
const TourGateContext = createContext<Gate>({ blocked: false, reportTour: () => {} });

export function TourGateProvider({ blocked, onTourEvent, children }: {
  blocked: boolean;
  onTourEvent?: (key: string, event: TourEvent) => void;
  children: React.ReactNode;
}) {
  const value = useMemo<Gate>(() => ({ blocked, reportTour: onTourEvent ?? (() => {}) }), [blocked, onTourEvent]);
  return <TourGateContext.Provider value={value}>{children}</TourGateContext.Provider>;
}

export const useTourGate = () => useContext(TourGateContext);
