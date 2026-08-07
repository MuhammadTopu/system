import Joi from "joi";

export const itemSchema = Joi.object({
    name: Joi.string().optional(),
    brand: Joi.string().min(3).required(),
    model: Joi.string().min(1).required(),
    purchase_date: Joi.date().required(),
    total_mileage: Joi.number().optional(),
    year_of_the_model: Joi.string().min(1).required(),
    category: Joi.string().min(1).required(),
    engine: Joi.string().optional(),
    transmission: Joi.string().optional(),
    drivetrain: Joi.string().optional(),
    current_mileage: Joi.number().optional(),
    average_mileage_per_year: Joi.number().optional(),
    user_notes: Joi.string().optional(),
});

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