import Joi from "joi";

export const itemSchema = Joi.object({
    name: Joi.string().min(3).required(),
    brand: Joi.string().min(3).required(),
    model: Joi.string().min(1).required(),
    purchase_date: Joi.date().required(),
    total_mileage: Joi.number().required(),
    year_of_the_model: Joi.string().min(1).required(),
    category: Joi.string().min(1).required(),
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
    oldPassword: Joi.string().min(8).required(),
    newPassword: Joi.string().min(8).required(),
});
