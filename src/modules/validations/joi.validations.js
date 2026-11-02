import Joi from "joi";
import { HOME_SYSTEM_SLUGS } from "../add_items/home.systems.js";

// Optional text fields: forms often send "" for an untouched input.
const optionalText = () => Joi.string().allow("").optional();

export const vehicleItemSchema = Joi.object({
    name: Joi.string().optional(),
    brand: Joi.string().min(3).required(),
    model: Joi.string().min(1).required(),
    purchase_date: Joi.date().required(),
    total_mileage: Joi.number().optional(),
    year_of_the_model: Joi.string().min(1).required(),
    category: Joi.string().valid("Vehicle").required(),
    engine: Joi.string().optional(),
    transmission: Joi.string().optional(),
    drivetrain: Joi.string().optional(),
    current_mileage: Joi.number().optional(),
    average_mileage_per_year: Joi.number().optional(),
    user_notes: Joi.string().optional(),
});

export const homeItemSchema = Joi.object({
    category: Joi.string().valid("Home").required(),
    name: Joi.string().trim().min(1).required(), // property name
    property_type: Joi.string().trim().min(1).required(),
    year_of_the_model: optionalText(), // year built
    zip_code: Joi.string().allow("").max(10).optional(),
    own_or_rent: Joi.string().valid("Own", "Rent", "").optional(),
    systems: Joi.array()
        .items(
            Joi.string()
                .trim()
                .lowercase()
                .valid(...HOME_SYSTEM_SLUGS)
                .messages({ "any.only": 'Invalid system "{#value}"' }),
        )
        .single()
        .default([]),
    user_notes: optionalText(),
});

export const otherItemSchema = Joi.object({
    category: Joi.string().valid("Custom").required(), // "Other" is mapped to Custom
    name: Joi.string().trim().min(1).required(),
    group: optionalText(),
    description: optionalText(),
    due_date: Joi.date().allow("").optional(),
    repeat: optionalText(),
    reminder: optionalText(),
    user_notes: optionalText(),
});

const itemSchemas = {
    Vehicle: vehicleItemSchema,
    Home: homeItemSchema,
    Custom: otherItemSchema,
};

// Multipart forms send list fields as a JSON string or a comma separated string.
const parseList = (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t.startsWith("[")) {
        try {
            return JSON.parse(t);
        } catch {
            /* fall through to comma split */
        }
    }
    return t === "" ? [] : t.split(",").map((s) => s.trim()).filter(Boolean);
};

// Picks the schema for the item's category and validates against it.
// Returns { error: string | null, value }. "Other" is accepted and stored as "Custom".
export const validateItemBody = (body = {}) => {
    const category = body.category === "Other" ? "Custom" : body.category;
    const schema = itemSchemas[category];
    if (!schema) {
        const message = "Invalid category. Must be one of: Home, Vehicle, Other";
        return { error: message, errors: [message], value: null };
    }

    const input = { ...body, category };
    if (category === "Home" && input.systems !== undefined) {
        input.systems = parseList(input.systems);
    }

    // Report every problem at once, not just the first one.
    const { error, value } = schema.validate(input, { abortEarly: false });
    if (!error) {
        // the same system ticked twice is stored once
        if (Array.isArray(value.systems)) value.systems = [...new Set(value.systems)];
        return { error: null, errors: [], value };
    }

    // Fields of another category are not listed back to the client: one sentence
    // says it, and the details stay in the server log.
    const label = category === "Custom" ? "Other" : category;
    const unknown = error.details.filter((d) => d.type === "object.unknown");
    let errors;
    if (unknown.length) {
        // wrong-category fields are the real mistake: report only that
        console.warn(
            `Rejected ${label} item, fields not allowed: ${unknown.map((d) => d.context.key).join(", ")}`,
        );
        errors = [`${label} category cannot have these fields`];
    } else {
        errors = error.details.map((d) => d.message);
    }

    return { error: errors.join(". "), errors, value };
};

export const register_step_1_email = Joi.object({
    email: Joi.string().email().required(),
});

export const verify_otp = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().length(4).required(),
});

export const register_step_3 = Joi.object({
    name: Joi.string().min(4).required(),
    password: Joi.string().min(8).required(),
});

export const login = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    fcm_token: Joi.string().optional(),
});

export const social_login = Joi.object({
    token: Joi.string().required(),
    fcm_token: Joi.string().optional(),
    name: Joi.string().allow("").optional(),
});

export const refresh_token = Joi.object({
    refreshToken: Joi.string().required(),
});

export const forgot_password_otp_send = Joi.object({
    email: Joi.string().email().required(),
});
export const reset_password = Joi.object({
    new_password: Joi.string().min(8).required(),
});
export const update_user_details = Joi.object({
    name: Joi.string().min(4).optional(),
    email: Joi.string().email().optional(),
    contact_number: Joi.string().min(10).max(15).optional(),
    address: Joi.string().min(10).optional(),
    city: Joi.string().min(2).optional(),
    state: Joi.string().min(2).optional(),
    zip_code: Joi.string().min(4).max(10).optional(),
    country: Joi.string().min(2).optional(),
});

export const change_password = Joi.object({
    currentPassword: Joi.string().min(8).required(),
    newPassword: Joi.string().min(8).required(),
});

export const verify_forgot_password_otp = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().length(4).required(),
});