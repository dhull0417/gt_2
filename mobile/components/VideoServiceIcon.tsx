import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { VideoService } from '../utils/videoLinks';

const ZoomIcon = ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect x={0} y={0} width={24} height={24} rx={6} fill="#2D8CFF" />
        <Rect x={4} y={7.5} width={11} height={9} rx={2} fill="#FFFFFF" />
        <Path d="M16.5 10.2 L21 7.3 V16.7 L16.5 13.8 Z" fill="#FFFFFF" />
    </Svg>
);

const GoogleMeetIcon = ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect x={0} y={0} width={24} height={24} rx={6} fill="#FFFFFF" />
        <Path d="M9 6 H15 L18 9 V6 Z" fill="#00AC47" />
        <Path d="M18 9 L21 6 V18 L18 15 Z" fill="#FFBA00" />
        <Path d="M9 18 H15 L18 15 V18 Z" fill="#0066DA" />
        <Path d="M6 9 L9 6 V18 L6 15 Z" fill="#EA4335" />
        <Rect x={6} y={9} width={12} height={6} fill="#00832D" />
    </Svg>
);

const TeamsIcon = ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect x={0} y={0} width={24} height={24} rx={6} fill="#5059C9" />
        <Circle cx={16.5} cy={7.5} r={2.2} fill="#FFFFFF" />
        <Rect x={13} y={9.5} width={7} height={6} rx={1.5} fill="#FFFFFF" />
        <Rect x={4.5} y={6.5} width={9} height={9} rx={1.5} fill="#FFFFFF" fillOpacity={0.35} />
        <Rect x={7.2} y={9.2} width={1.6} height={5.5} fill="#5059C9" />
        <Rect x={5.2} y={9.2} width={5.6} height={1.6} fill="#5059C9" />
    </Svg>
);

const ICONS: Record<VideoService, React.ComponentType<{ size: number }>> = {
    zoom: ZoomIcon,
    'google-meet': GoogleMeetIcon,
    teams: TeamsIcon,
};

export default function VideoServiceIcon({ service, size = 16 }: { service: VideoService; size?: number }) {
    const Icon = ICONS[service];
    return <Icon size={size} />;
}
