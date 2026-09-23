interface MagoIconProps {
  size?: number;
}

// Deux anneaux entrelacés, motif partagé avec les autres apps (Orbit, Wenn,
// tracker de règles), coloré en terracotta pour identifier Mago dans la
// famille. Même géométrie que android-templates/icon/ic_launcher_foreground.xml.
export function MagoIcon({ size = 28 }: MagoIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="none"
        stroke="#C4622D"
        strokeWidth={9}
        d="M62,54 A17,17 0 1,1 28,54 A17,17 0 1,1 62,54 Z"
      />
      <path
        fill="none"
        stroke="#C4622D"
        strokeWidth={9}
        d="M80,54 A17,17 0 1,1 46,54 A17,17 0 1,1 80,54 Z"
      />
    </svg>
  );
}
