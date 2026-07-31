"use client";

/**
 * PHASE 0 PLACEHOLDER.
 *
 * Per DESIGN.md the real avatar is ~8 anime-styled characters × 5
 * illustrated tiers, and it lands in Phase 2. Deferring is free because an
 * avatar is just an image reference per (character, tier) — the tier-swap
 * logic below is identical whether the portrait is a masterpiece or this
 * silhouette.
 *
 * The point of testing it as a silhouette: if the tier-up moment doesn't
 * land without art, expensive art won't save it.
 *
 * The governing rule the art must obey: the avatar may never depict
 * something you haven't earned. Tier I is deliberately unremarkable.
 */

/* A narrow peaked hood over broad, angular shoulders — imposing rather than
   rounded. Earlier proportions read as a cartoon; a serious figure needs a
   small head and a wide silhouette. */
const HOOD =
  "M100 22 C83 22 71 40 71 63 L71 89 C71 98 75 105 82 110 L118 110 C125 105 129 98 129 89 L129 63 C129 40 117 22 100 22 Z";
const BODY =
  "M83 106 L50 126 C37 134 29 151 26 171 L33 216 L167 216 L174 171 C171 151 163 134 150 126 L117 106 Z";

/**
 * The figure itself stays System cyan — that is the app's identity, and a
 * figure tinted by whichever domain happens to lead reads as a coloured
 * blob rather than a character. The *aura* carries the domain colour, which
 * is what the spec actually asks for.
 */
const FIGURE = "#7fd4ff";

export function Avatar({
  tier,
  auraColor,
  /** Recent consistency, 0–1. Drives glow intensity. */
  consistency = 0.6,
  /** Decay, 0–1. Drains colour out of the figure. */
  decay = 0,
  flare = false,
  size = 190,
}: {
  tier: number;
  auraColor: string;
  consistency?: number;
  decay?: number;
  flare?: boolean;
  size?: number;
}) {
  const t = Math.max(1, Math.min(5, tier));

  // Tier I is plain on purpose. Everything below scales up from almost nothing.
  const outline = 0.22 + t * 0.15;
  const auraOpacity = (t - 1) * 0.17 * (0.45 + consistency * 0.55);
  const fillLift = 0.06 + t * 0.045;

  return (
    <div
      className="relative"
      style={{
        width: size,
        height: size * 1.16,
        filter: decay > 0 ? `saturate(${1 - decay * 0.8}) brightness(${1 - decay * 0.3})` : undefined,
      }}
    >
      {/* Live aura — CSS, not artwork. Colour tracks the dominant domain,
          intensity tracks recent consistency. Free, and never needs assets. */}
      {t >= 2 && (
        <div
          aria-hidden
          className="animate-aura absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 52% 42% at 50% 46%, ${auraColor}, transparent 70%)`,
            opacity: auraOpacity,
            filter: "blur(14px)",
          }}
        />
      )}

      {flare && (
        <div
          aria-hidden
          className="animate-flare absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 44%, ${auraColor}, transparent 62%)`,
          }}
        />
      )}

      <svg
        viewBox="0 0 200 232"
        className="relative h-full w-full"
        role="img"
        aria-label={`Character silhouette, tier ${t}`}
      >
        <defs>
          <linearGradient id="figure" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FIGURE} stopOpacity={fillLift * 1.4} />
            <stop offset="100%" stopColor={FIGURE} stopOpacity={fillLift * 0.35} />
          </linearGradient>
        </defs>

        {/* T4+: halo arc */}
        {t >= 4 && (
          <path
            d="M52 44 A56 56 0 0 1 148 44"
            fill="none"
            stroke={FIGURE}
            strokeWidth="1.5"
            opacity={0.5}
          />
        )}

        {/* T5: crown */}
        {t >= 5 && (
          <path
            d="M74 34 L82 8 L92 30 L100 2 L108 30 L118 8 L126 34 Z"
            fill={FIGURE}
            opacity={0.75}
          />
        )}

        {/* The figure */}
        <path d={BODY} fill="url(#figure)" stroke={FIGURE} strokeWidth="1.2" strokeOpacity={outline} />
        <path d={HOOD} fill="url(#figure)" stroke={FIGURE} strokeWidth="1.2" strokeOpacity={outline} />

        {/* Face void — the hood is empty. It is an emblem, not a portrait. */}
        <ellipse cx="100" cy="72" rx="20" ry="25" fill="#04060c" opacity="0.92" />

        {/* Eyes appear once awakened */}
        {t >= 2 && (
          <g opacity={0.5 + t * 0.1}>
            <rect x="88" y="69" width="8" height="2.4" rx="1.2" fill={FIGURE} />
            <rect x="104" y="69" width="8" height="2.4" rx="1.2" fill={FIGURE} />
          </g>
        )}

        {/* T3+: pauldrons */}
        {t >= 3 && (
          <g fill={FIGURE} opacity={0.34}>
            <path d="M66 118 L38 134 L47 156 L74 136 Z" />
            <path d="M134 118 L162 134 L153 156 L126 136 Z" />
          </g>
        )}

        {/* T4+: cloak flare */}
        {t >= 4 && (
          <g fill={FIGURE} opacity={0.18}>
            <path d="M40 152 C26 174 19 198 17 220 L40 220 C40 195 44 172 50 156 Z" />
            <path d="M160 152 C174 174 181 198 183 220 L160 220 C160 195 156 172 150 156 Z" />
          </g>
        )}

        {/* T5: particles */}
        {t >= 5 && (
          <g fill={FIGURE}>
            {[
              [40, 96, 1.9],
              [162, 118, 1.5],
              [56, 176, 1.6],
              [148, 76, 1.3],
              [34, 138, 1.2],
              [170, 166, 1.7],
            ].map(([cx, cy, r], i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                opacity={0.75}
                className="animate-aura"
                style={{ animationDelay: `${i * 480}ms` }}
              />
            ))}
          </g>
        )}

        {/* Ground line — the figure stands on something. */}
        <ellipse
          cx="100"
          cy="220"
          rx={40 + t * 5}
          ry="4"
          fill={auraColor}
          opacity={0.1 + t * 0.05}
        />
      </svg>
    </div>
  );
}
