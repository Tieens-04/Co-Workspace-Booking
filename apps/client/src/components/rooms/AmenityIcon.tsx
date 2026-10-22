import type { LucideIcon, LucideProps } from 'lucide-react';
import { ClipboardList, Coffee, Monitor, Projector, Sparkles, VolumeX, Wifi } from 'lucide-react';

const AMENITY_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  coffee: Coffee,
  monitor: Monitor,
  tv: Monitor,
  board: ClipboardList,
  clipboard: ClipboardList,
  projector: Projector,
  'volume-x': VolumeX,
};

interface AmenityIconProps extends Omit<LucideProps, 'ref'> {
  /** Icon key stored on the amenity (e.g. "wifi"); unknown keys fall back to a neutral glyph. */
  icon: string | null;
}

/** Decorative lucide icon for an amenity. Always hidden from assistive tech. */
export function AmenityIcon({ icon, ...props }: AmenityIconProps) {
  const Icon = (icon && AMENITY_ICONS[icon]) || Sparkles;
  return <Icon aria-hidden="true" strokeWidth={1.5} {...props} />;
}
