// Response shapes for items. Each category returns only its own fields, so a Home
// item never carries vehicle fields (brand, mileage, ...) and the other way round.
// The database keeps one Item table; this is the only place that decides which
// fields belong to which category.

const pick = (obj, keys) =>
  Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));

const FIELDS = {
  Vehicle: {
    summary: [
      "brand",
      "model",
      "year_of_the_model",
      "engine",
      "transmission",
      "drivetrain",
      "current_mileage",
      "average_mileage_per_year",
    ],
    detail: ["purchase_date", "total_mileage", "service_intervals", "forum_suggestions"],
  },
  Home: {
    summary: ["property_type", "year_of_the_model", "zip_code", "own_or_rent", "systems"],
    detail: [],
  },
  Custom: {
    summary: ["group", "description", "due_date", "repeat", "reminder"],
    detail: [],
  },
};

// "Custom" is stored in the database; the app calls it "Other".
export const categoryLabel = (category) => (category === "Custom" ? "Other" : category);

export const imageUrl = (filename) =>
  filename
    ? `${process.env.MEDIA_URL || "http://localhost:8070"}/uploads/${filename}`
    : null;

// Short form for lists.
export const toItemSummary = (item) => {
  const fields = FIELDS[item.category] || FIELDS.Custom;
  return {
    id: item.id,
    category: categoryLabel(item.category),
    name: item.name,
    user_notes: item.user_notes ?? null,
    ...pick(item, fields.summary),
  };
};

// Full form for a single item.
export const toItemDetail = (item) => {
  const fields = FIELDS[item.category] || FIELDS.Custom;
  return {
    ...toItemSummary(item),
    created_at: item.created_at,
    current_date: item.current_date ?? null,
    image_url: imageUrl(item.image_url),
    ...pick(item, fields.detail),
  };
};
