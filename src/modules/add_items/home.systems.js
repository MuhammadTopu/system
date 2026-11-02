// The fixed "What does this property have?" checklist for Home items.
// The app sends the slug; the label is what the user sees (and what the AI is given).
export const HOME_SYSTEMS = [
  { slug: "central_hvac", label: "Central HVAC / heat pump / furnace" },
  { slug: "window_ac", label: "Window or mini-split AC" },
  { slug: "water_heater", label: "Water heater" },
  { slug: "well", label: "Well" },
  { slug: "septic", label: "Septic" },
  { slug: "municipal_water_sewer", label: "Municipal water/sewer" },
  { slug: "gutters", label: "Gutters" },
  { slug: "fireplace_wood_stove", label: "Fireplace / wood stove" },
  { slug: "sump_pump", label: "Sump pump" },
  { slug: "basement_crawlspace", label: "Basement / crawlspace" },
  { slug: "garage", label: "Garage" },
  { slug: "deck_porch", label: "Deck / porch" },
  { slug: "pool_hot_tub", label: "Pool / hot tub" },
  { slug: "irrigation_system", label: "Irrigation system" },
  { slug: "generator", label: "Generator" },
  { slug: "water_softener_filtration", label: "Water softener / filtration" },
];

export const HOME_SYSTEM_SLUGS = HOME_SYSTEMS.map((s) => s.slug);

const LABELS = Object.fromEntries(HOME_SYSTEMS.map((s) => [s.slug, s.label]));

// Falls back to the slug itself for anything not in the list.
export const systemLabel = (slug) => LABELS[slug] || slug;
