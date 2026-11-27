import React from 'react';
import {
  Award,
  Camera,
  Compass,
  Crown,
  Feather,
  Flame,
  Gem,
  Globe,
  Heart,
  Medal,
  MessageCircle,
  Music,
  Palette,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Sun,
  Trophy,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import { UnifiedBadgeMeta } from '../services/challengesService';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  trophy: Trophy,
  crown: Crown,
  flame: Flame,
  star: Star,
  sparkles: Sparkles,
  award: Award,
  medal: Medal,
  zap: Zap,
  music: Music,
  camera: Camera,
  video: Video,
  heart: Heart,
  shield: Shield,
  gem: Gem,
  rocket: Rocket,
  palette: Palette,
  globe: Globe,
  compass: Compass,
  sun: Sun,
  feather: Feather,
  users: Users,
  'message-circle': MessageCircle,
};

interface BadgeIconGlyphProps {
  badge?: UnifiedBadgeMeta | null;
  iconName?: string;
  imageUrl?: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}

export const BadgeIconGlyph: React.FC<BadgeIconGlyphProps> = ({
  badge,
  iconName,
  imageUrl,
  color,
  size = 'md',
  className = '',
  title,
}) => {
  const resolvedImage = imageUrl ?? badge?.imageUrl;
  const resolvedIconKey = (iconName ?? badge?.iconName ?? 'trophy').toLowerCase();
  const resolvedColor = color ?? badge?.color ?? '#8b5cf6';
  const IconComp = ICON_MAP[resolvedIconKey] || Trophy;

  const sizeMap = {
    xs: { box: 'w-4 h-4 rounded-full', icon: 'w-2.5 h-2.5' },
    sm: { box: 'w-6 h-6 rounded-lg', icon: 'w-3.5 h-3.5' },
    md: { box: 'w-10 h-10 rounded-xl', icon: 'w-5 h-5' },
    lg: { box: 'w-16 h-16 rounded-2xl', icon: 'w-8 h-8' },
  };
  const dims = sizeMap[size];

  if (resolvedImage) {
    return (
      <span
        title={title || badge?.name}
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden border ${dims.box} ${className}`}
        style={{
          borderColor: `${resolvedColor}66`,
          backgroundColor: `${resolvedColor}1f`,
        }}
      >
        <img
          src={resolvedImage}
          alt={title || badge?.name || 'Badge'}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      title={title || badge?.name}
      className={`inline-flex items-center justify-center shrink-0 border ${dims.box} ${className}`}
      style={{
        color: resolvedColor,
        borderColor: `${resolvedColor}55`,
        backgroundColor: `${resolvedColor}22`,
      }}
    >
      <IconComp className={dims.icon} />
    </span>
  );
};
