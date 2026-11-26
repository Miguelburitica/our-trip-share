# Our Share — Design system "Tonal"

Approved direction for the app UI. Canvas: https://claude.ai/artifact/Y2cDBED2JYZGcrqgUZsBS4 (page "App · Tonal").

## Principles
1. **Air over density.** One big number, one primary action, and at most one pending item per screen. Everything else is summarized ("y 2 más").
2. **Few colors.** Warm neutrals + ink + a single coral accent. Hue is never the only signal: labels say "Te deben" / "Debes".
3. **No borders.** Separation comes from tonal surfaces (sand vs white) and spacing, not lines.
4. **Lists show *my share*.** One amount per row. Totals, icons and badges only when they carry meaning.
5. **Rounded and soft.** Pills for actions, 22–32px radii for surfaces.

## Tokens

| Token | Value | Use |
|---|---|---|
| `bg` | `#FBF7F3` | App background |
| `surface` | `#FFFFFF` | Cards, lists (shadow `0 1px 2px rgba(43,36,32,.05)`) |
| `tint` | `#F3ECE4` | Hero card, secondary buttons, inputs, chips, my highlighted row |
| `tint-2` | `#EAE1D6` | Other people's avatars, disabled |
| `ink` | `#2B2420` | Text, selected states, my avatar, tab bar, positive balance |
| `ink-2` | `#4A3F38` | Active tab background |
| `muted` | `#75655A` | Secondary text (≥4.5:1 on bg and tint) |
| `accent` | `#C24E2A` | Primary CTA only (+, Guardar, Cobrar, Enviar, Entrar), negative balance bars |
| `accent-soft` | `#F6E3DA` | Attention chips (Sin monto), selected preset |
| `accent-text` | `#9A3E1F` | "Debes" amounts, warnings, text on accent-soft |
| `dashed` | `#CDBFB1` | Unclaimed seat / excluded person outline |

## Type
- **Figtree** (Google Fonts), weights 400/500/600/700, with system-ui fallback.
- Hero amount: 44–54px / 700 / −0.03em / tabular numbers.
- Screen title: 30px / 700. Section label: 14–15px / 600 (muted for day headers).
- Body/rows: 15px / 600 title + 13px muted subtitle.
- No display or "quirky" faces.

## Components
- **Tab bar:** a floating dark pill (`ink`, 68px tall, inset 16px). The active item is an `ink-2` circle, and the center + is a 52px `accent` circle. Icon-only, with `aria-label`s.
- **Buttons:** pill shape. Primary = `accent`/white; strong secondary = `ink`/`bg`; secondary = `tint`/`ink`; tertiary = text link.
- **Chips:** 36–42px pills; selected = `ink`, unselected = `tint`.
- **Avatars:** circles with initials. Me = `ink`, others = `tint-2`, unclaimed = dashed outline.
- **Lists:** rows grouped by day inside white rounded cards, 62px rows, no dividers.
- **Sheets:** `bg` with a 32px top radius, scrim `rgba(43,36,32,.4)`.
- **Touch targets:** ≥ 44px.
