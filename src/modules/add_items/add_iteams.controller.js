import dotenv from "dotenv";
import validator from "validator";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { validateItemBody } from "../validations/joi.validations.js";
import { toItemSummary, toItemDetail } from "./item.dto.js";
import {
  MAX_QUESTION_ROUNDS,
  buildQuestionPrompt,
  buildTaskPrompt,
  buildServiceIntervalPrompt,
  buildForumPrompt,
  normalizeQuestions,
  validateAnswer,
} from "./category.prompts.js";
import { notifyUser, NOTIFICATION_TYPES } from "../notification/notification.service.js";
import { toDueAt } from "./task.due.js";
import { findShopsForTasks, resolveShopLocation } from "./shop.suggestions.js";
import { openAiPost, parseJsonResponse } from "../../common/helper/openai.helper.js";
import { isUserPremium } from "../../common/helper/subscription.helper.js";
dotenv.config();

const prisma = new PrismaClient();
const { sign, verify } = pkg;
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



// const generateItemData = async (item) => {
//   try {
//     const serviceIntervalPrompt = `
//       Based on the following item details, generate recommended service intervals:
//       - Category: ${item.category || "Unspecified"}
//       - Brand: ${item.brand}
//       - Model: ${item.model}
//       - Total Mileage: ${item.total_mileage}
//       - Purchase Date: ${item.purchase_date}
//       Please provide a list of recommended service intervals (e.g., every X miles or every Y months).

//       if its not a vehicle, provide general maintenance intervals.
//       Make the intervals specific to the brand and model where possible.
//       Respond in a concise bullet-point format.
//     `;

//     const forumSuggestionPrompt = `
//       Based on the following item details, suggest related forums:
//       - Category: ${item.category || "Unspecified"}
//       - Brand: ${item.brand}
//       - Model: ${item.model}
//       Please suggest 3-5 forum suggestions for discussions related to this item.
//       check the country specific forums as well.
//       Respond in a concise bullet-point format.
//       If no relevant forums are found, respond with "No forums found".
//     `;

//     const serviceIntervalResponse = await axios.post(
//       "https://api.openai.com/v1/chat/completions",
//       {
//         model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
//         messages: [
//           { role: "system", content: "You are a helpful assistant." },
//           { role: "user", content: serviceIntervalPrompt },
//         ],
//         max_tokens: 250,
//         temperature: 0.7,
//       },
//       {
//         headers: { Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}` },
//       },
//     );

//     const forumSuggestionResponse = await axios.post(
//       "https://api.openai.com/v1/chat/completions",
//       {
//         model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
//         messages: [
//           { role: "system", content: "You are a helpful assistant." },
//           { role: "user", content: forumSuggestionPrompt },
//         ],
//         max_tokens: 250,
//       },
//       {
//         headers: { Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}` },
//       },
//     );

//     let forumSuggestions = [];
//     if (
//       forumSuggestionResponse.data &&
//       forumSuggestionResponse.data.choices &&
//       forumSuggestionResponse.data.choices[0].message
//     ) {
//       forumSuggestions =
//         forumSuggestionResponse.data.choices[0].message.content.split("\n");
//     }

//     return {
//       service_intervals:
//         serviceIntervalResponse.data.choices[0].message.content.split("\n"),
//       forum_suggestions: forumSuggestions,
//     };
//   } catch (error) {
//     console.error("Error generating item data with openAi:", error);
//     return null;
//   }
// };

// Service interval lines for a Home / Other item (free tier: up to 5). Throws if
// the AI call fails.
const generateServiceIntervals = async (item, maxItems) => {
  const response = await openAiPost(
    "https://api.openai.com/v1/chat/completions",
    {
      model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: buildServiceIntervalPrompt(item, maxItems) },
      ],
      max_tokens: 700,
      temperature: 0.7,
    },
  );

  return response.data.choices[0].message.content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const generateItemData = async (item) => {
  try {
    const isVehicle = item.category === "Vehicle";

    const vehicleIntervalPrompt = `
Generate a recommended service interval list for the following item.

- Category: ${item.category || "Unspecified"}
- Brand: ${item.brand}
- Model: ${item.model}
- Year: ${item.year_of_the_model || "Not available"}
- Engine: ${item.engine || "Not available"}
- Current Mileage: ${item.current_mileage || item.total_mileage || "Not available"}
- Purchase Date: ${item.purchase_date}

If it is not a vehicle, provide general maintenance intervals instead.
Make intervals specific to the brand and model where possible.

FORMAT RULES:
- Return a numbered list only.
- One service item per line, in exactly this format:
  1. Service Name - interval
- Maximum 12 items.
- No markdown, no bold, no asterisks, no bullet characters.
- No blank lines.
- No introduction sentence and no closing sentence.
`.trim();

    const serviceIntervalPrompt = isVehicle
      ? vehicleIntervalPrompt
      : buildServiceIntervalPrompt(item, 12);

    const serviceIntervalResponse = await openAiPost(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: serviceIntervalPrompt },
        ],
        max_tokens: 700,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}`,
        },
      },
    );

    const service_intervals = serviceIntervalResponse.data.choices[0].message.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const vehicleForumPrompt = `
You are Maintenance Genie, an automotive maintenance assistant.

Your task is NOT to list forums. Your task is to report maintenance recommendations
that owner communities have arrived at for this specific vehicle, where those
recommendations DIFFER from the manufacturer's published schedule.

──────────────────────────────
VEHICLE
──────────────────────────────
Year: ${item.year_of_the_model || "Not available"}
Make: ${item.brand || "Not available"}
Model: ${item.model || "Not available"}
Engine: ${item.engine || "Not available"}
Transmission: ${item.transmission || "Not available"}
Drivetrain: ${item.drivetrain || "Not available"}
Current Mileage: ${item.current_mileage || item.total_mileage || "Not available"}

──────────────────────────────
WHAT WE ARE LOOKING FOR
──────────────────────────────
Manufacturers publish a maintenance schedule. Over time, owners discover that some
of those intervals are too long and lead to premature failures. Owner forums and
enthusiast communities then converge on a shorter, safer interval based on real
world experience.

Example: the manufacturer specifies transmission fluid every 75,000 miles, but there
are widespread reports of transmission problems, so owner communities recommend
changing it every 30,000 miles instead.

That difference is the data we want.

──────────────────────────────
RULES
──────────────────────────────
1. Return between 3 and 5 recommendations. Quality matters far more than quantity.
   One real finding is better than three generic ones.
2. Base recommendations on widely reported owner community consensus for this
   specific vehicle. Consider year, engine, transmission and drivetrain.
3. Never invent a failure mode or an interval. Only report consensus you are
   confident is real and commonly discussed among owners of this vehicle.
4. Do NOT include engine oil, tire rotation, engine air filters, cabin air filters,
   brake fluid, wiper blades, or general fluid top-ups. These are routine items
   already covered by the standard maintenance schedule.
5. Generic advice such as "change fluids more often for longevity" is NOT a community
   finding. Only include an item when owners of this specific vehicle report an
   actual problem that the factory interval failed to prevent.
6. The "reason" must name the concrete symptom or failure owners report, for example
   "torque converter shudder" or "premature water pump bearing failure". Do not use
   vague benefits like "improves longevity" or "maintains performance".
7. "source_forum" is REQUIRED. Name the actual owner community where this is commonly
   discussed, using its real, well known name (for example "ToyotaNation",
   "Reddit r/Toyota"). Only name communities you are confident genuinely exist for
   this make. If you cannot confidently name one, use "Owner communities".
8. "source_url" is OPTIONAL and must be an empty string unless you are certain of a
   real URL. Never fabricate a URL, a thread title, or a link. A missing URL is never
   a reason to withhold a recommendation.
9. "confidence" must be "High", "Medium" or "Low", reflecting how widely the
   recommendation is reported.
10. Return an empty array if this vehicle has no known community recommendation that
    meets the bar above. An empty array is an acceptable answer. Never pad.
11. Use plain language an average vehicle owner will understand.
12. Return ONLY valid JSON. No markdown. No text outside the JSON.

──────────────────────────────
RETURN THIS EXACT JSON FORMAT
──────────────────────────────
{
  "forum_suggestions": [
    {
      "maintenance_item": "Transmission Fluid",
      "category": "Transmission",
      "manufacturer_interval": "Every 75,000 miles",
      "forum_recommended_interval": "Every 30,000 miles",
      "reason": "Owners report torque converter shudder and early transmission failure when the factory interval is followed.",
      "applies_to": "Automatic transmission models",
      "confidence": "High",
      "source_forum": "ToyotaNation",
      "source_url": ""
    }
  ]
}
    `.trim();

    const forumSuggestionPrompt = isVehicle
      ? vehicleForumPrompt
      : buildForumPrompt(item);

    const forumSuggestionResponse = await openAiPost(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: forumSuggestionPrompt }],
        max_tokens: 1500,
        temperature: 0.2,
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}`,
        },
      },
    );

    const forumRaw = forumSuggestionResponse.data.choices[0].message.content;

    let forum_suggestions = [];
    try {
      const parsed = parseJsonResponse(forumRaw);
      const list = Array.isArray(parsed.forum_suggestions)
        ? parsed.forum_suggestions
        : [];

      forum_suggestions = list.map((s) => {
        const url = String(s.source_url || "").trim();
        return {
          ...s,
          source_forum:
            String(s.source_forum || "").trim() || "Owner communities",
          // only keep a URL if it at least looks like a real absolute link
          source_url: /^https?:\/\/\S+\.\S+/.test(url) ? url : "",
        };
      });
    } catch (err) {
      forum_suggestions = [];
    }

    return { service_intervals, forum_suggestions };
  } catch (error) {
    console.error("Error generating item data with openAi:", error.response?.data || error.message);
    return null;
  }
};
// export const addItem = async (req, res) => {
//   try {
//     const { error, value } = itemSchema.validate(req.body);

//     if (error) {
//       return res.status(400).json({ message: error.details[0].message });
//     }

//     const {
//       name,
//       category,
//       brand,
//       model,
//       year_of_the_model,
//       purchase_date,
//       total_mileage,
//     } = value;

//     if(category != 'Home' && category != 'Vehicle' && category != 'Appliance' && category != 'Electronics' && category != 'Custom'){
//       return res.status(400).json({ message: "Invalid category" });
//     }

//     const formattedPurchaseDate = purchase_date
//       ? new Date(purchase_date)
//       : null;
//     // const formattedLastServiceDate = last_service_date ? new Date(last_service_date) : null;
//     const mileage = total_mileage ? parseFloat(total_mileage) : null;

//     const userId = req.user?.userId;
//     if (!userId) {
//       return res.status(400).json({ message: "User ID is required" });
//     }

//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//       select: { is_subscribed: true, role: true },
//     });

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const { is_subscribed, role } = user;

//     // Create new item in the database
//     const newItem = await prisma.item.create({
//       data: {
//         name,
//         brand,
//         model,
//         purchase_date: formattedPurchaseDate,
//         total_mileage: mileage,
//         year_of_the_model,
//         category,
//         image_url: req.file ? req.file.filename : null,
//         user_id: userId,
//       },
//     });

//     let generatedData;

//     // Generate additional data based on user subscription and role
//     if (is_subscribed === true && role === "premium") {
//       generatedData = await generateItemData(req.body);
//     } else {
//       const serviceIntervalPrompt = `
//         Based on the following item details, generate recommended service intervals:
//         - Category: ${category || "Unspecified"}
//         - Brand: ${brand}
//         - Model: ${model}
//         - Total Mileage: ${total_mileage}
//         - Purchase Date: ${purchase_date}
//         Please provide a list of recommended service intervals (e.g., every X miles or every Y months).
//       `;

//       const serviceIntervalResponse = await axios.post(
//         "https://api.openai.com/v1/chat/completions",
//         {
//           model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
//           messages: [
//             { role: "system", content: "You are a helpful assistant." },
//             { role: "user", content: serviceIntervalPrompt },
//           ],
//           max_tokens: 200,
//         },
//         {
//           headers: { Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}` },
//         },
//       );

//       generatedData = {
//         service_intervals:
//           serviceIntervalResponse.data.choices[0].message.content.split("\n"),
//       };
//     }

//     if (generatedData) {
//       const updatedItem = await prisma.item.update({
//         where: { id: newItem.id },
//         data: {
//           service_intervals: generatedData.service_intervals,
//           forum_suggestions: generatedData.forum_suggestions || [],
//         },
//       });

//       const imageUrl = req.file
//         ? `http://localhost:8070/uploads/${req.file.filename}`
//         : null;

//       return res.status(201).json({
//         success: true,
//         message: "Item added successfully with generated data",
//         item: updatedItem,
//         imageUrl,
//       });
//     } else {
//       return res
//         .status(500)
//         .json({ message: "Failed to generate additional data for item" });
//     }
//   } catch (error) {
//     console.error("Error adding item:", error);

//     if (req.file) {
//       fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
//     }

//     return res
//       .status(500)
//       .json({ message: "Internal server error", error: error.message });
//   }
// };

export const addItem = async (req, res) => {
  try {
    const { error, value } = validateItemBody(req.body);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const imageUrl = req.file
      ? `${process.env.MEDIA_URL || "http://localhost:8070"}/uploads/${req.file.filename}`
      : null;

    // Home and Other: saved as-is. Questions, answers and tasks follow (premium).
    if (value.category !== "Vehicle") {
      const base = {
        name: value.name,
        category: value.category,
        image_url: req.file ? req.file.filename : null,
        user_id: userId,
        current_date: new Date(),
        user_notes: value.user_notes || null,
      };

      const data =
        value.category === "Home"
          ? {
              ...base,
              property_type: value.property_type,
              year_of_the_model: value.year_of_the_model || null,
              zip_code: value.zip_code || null,
              own_or_rent: value.own_or_rent || null,
              systems: value.systems || [],
            }
          : {
              ...base,
              group: value.group || null,
              sub_category: value.sub_category || null,
              description: value.description || null,
              due_date: value.due_date ? new Date(value.due_date) : null,
              repeat: value.repeat || null,
              reminder: value.reminder || null,
            };

      // Same as Vehicle: everyone gets service intervals (5 for free users, up to
      // 12 for premium) and premium users also get forum suggestions. Nothing is
      // saved unless the AI call succeeds.
      let generated = null;
      if (await isUserPremium(userId)) {
        generated = await generateItemData(data); // null on failure
      } else {
        try {
          generated = {
            service_intervals: await generateServiceIntervals(data, 5),
            forum_suggestions: [],
          };
        } catch (aiError) {
          console.error(
            "Error generating service intervals:",
            aiError.response?.data || aiError.message,
          );
        }
      }

      if (!generated) {
        if (req.file) {
          const filePath = path.join(__dirname, "../../uploads", req.file.filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        return res
          .status(500)
          .json({ message: "Failed to generate additional data for item" });
      }

      const created = await prisma.item.create({
        data: {
          ...data,
          service_intervals: generated.service_intervals,
          forum_suggestions: generated.forum_suggestions || [],
        },
      });

      notifyUser(userId, {
        title: "Item added",
        body: `${created.name} was added successfully.`,
        type: NOTIFICATION_TYPES.ITEM_ADDED,
        entityId: created.id,
        data: { itemId: created.id },
      });

      return res.status(201).json({
        success: true,
        message: "Item added successfully with generated data",
        item: toItemDetail(created),
        imageUrl,
      });
    }

    const {
      name,
      category,
      brand,
      model,
      year_of_the_model,
      purchase_date,
      total_mileage,
      engine,
      transmission,
      drivetrain,
      current_mileage,
      average_mileage_per_year,
      user_notes,
    } = value;

    const formattedPurchaseDate = purchase_date
      ? new Date(purchase_date)
      : null;
    const mileage = total_mileage ? parseFloat(total_mileage) : null;
    const currentMileage = current_mileage ? parseFloat(current_mileage) : null;
    const avgMileagePerYear = average_mileage_per_year
      ? parseFloat(average_mileage_per_year)
      : null;

    const isPremium = await isUserPremium(userId);

    // Built first, saved only after AI generation succeeds, so a failed
    // generation never leaves a half-created item behind.
    const itemData = {
      name,
      brand,
      model,
      purchase_date: formattedPurchaseDate,
      total_mileage: mileage,
      year_of_the_model,
      category,
      image_url: req.file ? req.file.filename : null,
      user_id: userId,
      engine: engine || null,
      transmission: transmission || null,
      drivetrain: drivetrain || null,
      current_mileage: currentMileage,
      average_mileage_per_year: avgMileagePerYear,
      current_date: new Date(),
      user_notes: user_notes || null,
    };

    let generatedData = null;

    if (isPremium) {
      // generateItemData returns null on failure
      generatedData = await generateItemData(itemData);
    } else {
      try {
      const serviceIntervalPrompt = `
Generate a recommended service interval list for the following item.

- Category: ${category || "Unspecified"}
- Brand: ${brand}
- Model: ${model}
- Year: ${year_of_the_model || "Not available"}
- Engine: ${engine || "Not available"}
- Current Mileage: ${currentMileage || mileage || "Not available"}
- Purchase Date: ${purchase_date}

If it is not a vehicle, provide general maintenance intervals instead.
Make intervals specific to the brand and model where possible.

FORMAT RULES:
- Return a numbered list only.
- One service item per line, in exactly this format:
  1. Service Name - interval
- Maximum 5 items.
- No markdown, no bold, no asterisks, no bullet characters.
- No blank lines.
- No introduction sentence and no closing sentence.
`.trim();

      const serviceIntervalResponse = await openAiPost(
        "https://api.openai.com/v1/chat/completions",
        {
          model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: serviceIntervalPrompt },
          ],
          max_tokens: 700,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}`,
          },
        },
      );

      generatedData = {
        service_intervals: serviceIntervalResponse.data.choices[0].message.content
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
        forum_suggestions: [],
      };
      } catch (aiError) {
        console.error(
          "Error generating service intervals:",
          aiError.response?.data || aiError.message,
        );
        generatedData = null;
      }
    }

    if (generatedData) {
      const updatedItem = await prisma.item.create({
        data: {
          ...itemData,
          service_intervals: generatedData.service_intervals,
          // now stored as structured JSON, not a string array
          forum_suggestions: generatedData.forum_suggestions || [],
        },
      });

      notifyUser(userId, {
        title: "Item added",
        body: `${updatedItem.name} was added successfully.`,
        type: NOTIFICATION_TYPES.ITEM_ADDED,
        entityId: updatedItem.id,
        data: { itemId: updatedItem.id },
      });

      return res.status(201).json({
        success: true,
        message: "Item added successfully with generated data",
        item: toItemDetail(updatedItem),
        imageUrl,
      });
    } else {
      // nothing was saved; drop the uploaded image too
      if (req.file) {
        const filePath = path.join(__dirname, "../../uploads", req.file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      return res
        .status(500)
        .json({ message: "Failed to generate additional data for item" });
    }
  } catch (error) {
    console.error("Error adding item:", error.response?.data || error.message);

    if (req.file) {
      const filePath = path.join(__dirname, "../../uploads", req.file.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// export const addItem = async (req, res) => {
//   try {
//     const { error, value } = itemSchema.validate(req.body);

//     if (error) {
//       return res.status(400).json({ message: error.details[0].message });
//     }

//     const {
//       name,
//       category,
//       brand,
//       model,
//       year_of_the_model,
//       purchase_date,
//       total_mileage,
//       engine,
//       transmission,
//       drivetrain,
//       current_mileage,
//       average_mileage_per_year,
//       user_notes,
//     } = value;

//     if (
//       category != "Home" &&
//       category != "Vehicle" &&
//       category != "Appliance" &&
//       category != "Electronics" &&
//       category != "Custom"
//     ) {
//       return res.status(400).json({ message: "Invalid category" });
//     }

//     const formattedPurchaseDate = purchase_date
//       ? new Date(purchase_date)
//       : null;
//     const mileage = total_mileage ? parseFloat(total_mileage) : null;
//     const currentMileage = current_mileage ? parseFloat(current_mileage) : null;
//     const avgMileagePerYear = average_mileage_per_year
//       ? parseFloat(average_mileage_per_year)
//       : null;

//     const userId = req.user?.userId;
//     if (!userId) {
//       return res.status(400).json({ message: "User ID is required" });
//     }

//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//       select: { is_subscribed: true, role: true },
//     });

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const { is_subscribed, role } = user;

//     // Create new item in the database
//     const newItem = await prisma.item.create({
//       data: {
//         name,
//         brand,
//         model,
//         purchase_date: formattedPurchaseDate,
//         total_mileage: mileage,
//         year_of_the_model,
//         category,
//         image_url: req.file ? req.file.filename : null,
//         user_id: userId,
//         engine: engine || null,
//         transmission: transmission || null,
//         drivetrain: drivetrain || null,
//         current_mileage: currentMileage,
//         average_mileage_per_year: avgMileagePerYear,
//         current_date: new Date(),
//         user_notes: user_notes || null,
//       },
//     });

//     let generatedData;

//     // Generate additional data based on user subscription and role
//     if (is_subscribed === true && role === "premium") {
//       generatedData = await generateItemData(req.body);
//     } else {
//       const serviceIntervalPrompt = `
//         Based on the following item details, generate recommended service intervals:
//         - Category: ${category || "Unspecified"}
//         - Brand: ${brand}
//         - Model: ${model}
//         - Total Mileage: ${total_mileage}
//         - Purchase Date: ${purchase_date}
//         Please provide a list of recommended service intervals (e.g., every X miles or every Y months).
//       `;

//       const serviceIntervalResponse = await axios.post(
//         "https://api.openai.com/v1/chat/completions",
//         {
//           model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
//           messages: [
//             { role: "system", content: "You are a helpful assistant." },
//             { role: "user", content: serviceIntervalPrompt },
//           ],
//           max_tokens: 200,
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}`,
//           },
//         },
//       );

//       generatedData = {
//         service_intervals:
//           serviceIntervalResponse.data.choices[0].message.content.split("\n"),
//       };
//     }

//     if (generatedData) {
//       const updatedItem = await prisma.item.update({
//         where: { id: newItem.id },
//         data: {
//           service_intervals: generatedData.service_intervals,
//           forum_suggestions: generatedData.forum_suggestions || [],
//         },
//       });

//       const imageUrl = req.file
//         ? `http://localhost:8070/uploads/${req.file.filename}`
//         : null;

//       return res.status(201).json({
//         success: true,
//         message: "Item added successfully with generated data",
//         item: updatedItem,
//         imageUrl,
//       });
//     } else {
//       return res
//         .status(500)
//         .json({ message: "Failed to generate additional data for item" });
//     }
//   } catch (error) {
//     console.error("Error adding item:", error);

//     if (req.file) {
//       fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
//     }

//     return res
//       .status(500)
//       .json({ message: "Internal server error", error: error.message });
//   }
// };


// export const generateQuestions = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const item = await prisma.item.findUnique({
//       where: { id },
//       select: {
//         category: true,
//         brand: true,
//         model: true,
//         year_of_the_model: true,
//         purchase_date: true,
//       },
//     });

//     if (!item) return res.status(404).json({ message: "Item not found" });

//     const questionss = await prisma.questions.findUnique({
//       where: { itemId: id },
//       select: { question: true },
//     });

//     if (questionss && questionss.question && questionss.question !== "") {
//       return res.json({ success: true, questions: questionss.question });
//     } else {
//       const prompt = `
//         Based on the following item details, generate 5 yes/no diagnostic questions about possible issues:
//         - Category: ${item.category}
//         - Brand: ${item.brand}
//         - Model: ${item.model}
//         - Purchase Date: ${item.purchase_date}
//         - Year of making this model: ${item.year_of_the_model || "Not available"}
//         Please respond in JSON array format: ["Question 1?", "Question 2?", ...]
//         Make valid questions related to the ${item.category} ${item.brand} ${item.model} (${item.year_of_the_model}).
//         For example, a car made in 2015 will have different issues than a car made in 2020.
//         If the car was made in 2015, it may have common issues that everyone with that car model faces.
//         According to that, generate relevant questions.
//       `;

//       const response = await axios.post(
//         "https://api.openai.com/v1/chat/completions",
//         {
//           model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4",
//           messages: [{ role: "user", content: prompt }],
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}`,
//           },
//         },
//       );

//       let raw = response.data.choices[0].message.content.trim();

//       if (raw.startsWith("```")) {
//         raw = raw
//           .replace(/^```(?:json)?/, "")
//           .replace(/```$/, "")
//           .trim();
//       }

//       let questions;
//       try {
//         questions = JSON.parse(raw);
//       } catch (err) {
//         console.error("Failed to parse questions JSON from GPT:", raw);
//         return res
//           .status(500)
//           .json({ message: "Invalid JSON response from AI" });
//       }

//       let savedQuestions;
//       if (questionss) {
//         savedQuestions = await prisma.questions.update({
//           where: { itemId: id },
//           data: { question: questions },
//         });
//       } else {
//         savedQuestions = await prisma.questions.create({
//           data: {
//             question: questions,
//             itemId: id,
//           },
//         });
//       }

//       return res.json({ success: true, questions: savedQuestions.question });
//     }
//   } catch (error) {
//     console.error("Error generating questions:", error);
//     return res.status(500).json({ message: "Failed to generate questions" });
//   }
// };

// Every item field the question / task prompts can use.
const ITEM_CONTEXT_SELECT = {
  name: true,
  category: true,
  brand: true,
  model: true,
  year_of_the_model: true,
  engine: true,
  transmission: true,
  drivetrain: true,
  current_mileage: true,
  average_mileage_per_year: true,
  user_notes: true,
  user_id: true,
  property_type: true,
  zip_code: true,
  own_or_rent: true,
  systems: true,
  group: true,
  sub_category: true,
  description: true,
  due_date: true,
  repeat: true,
  reminder: true,
};

// Shape of a Home / Other question sent to the app.
const formatAdaptiveQuestion = (q) => ({
  id: q.id,
  question_id: q.itemKey,
  question_text: q.question,
  input_type: q.input_type,
  options: q.options || [],
  optional: q.optional,
  reason: q.reason,
  maintenance_impact: q.maintenance_impact,
  round: q.round,
  answer: q.answer,
  skipped: q.skipped,
});

// One AI round of follow-up questions for a Home / Other item. Throws if the AI
// call or its JSON fails; nothing is saved here.
const askAdaptiveQuestions = async (item, answered, round, existingKeys) => {
  const response = await openAiPost(
    "https://api.openai.com/v1/chat/completions",
    {
      model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4o",
      messages: [
        { role: "user", content: buildQuestionPrompt(item, answered, round) },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    },
  );

  const parsed = parseJsonResponse(response.data.choices[0].message.content);
  const limit = round === 1 ? (item.category === "Home" ? 8 : 6) : 4;
  const questions = normalizeQuestions(parsed.questions, existingKeys, limit);

  return {
    needs_more_information: parsed.needs_more_information !== false && questions.length > 0,
    questions,
  };
};

const saveAdaptiveQuestions = async (itemId, category, questions, round) => {
  await prisma.questions.createMany({
    data: questions.map((q) => ({
      itemId,
      itemKey: q.itemKey,
      category,
      question: q.question,
      reason: q.reason,
      input_type: q.input_type,
      options: q.options,
      optional: q.optional,
      maintenance_impact: q.maintenance_impact,
      round,
    })),
    skipDuplicates: true,
  });

  return prisma.questions.findMany({
    where: { itemId, round },
    orderBy: { created_at: "asc" },
  });
};

const isAnswered = (q) => q.answer !== null || q.skipped;

// Home / Other: round 1 of questions, or whatever already exists.
const generateAdaptiveQuestionsForItem = async (res, item, id) => {
  const existing = await prisma.questions.findMany({
    where: { itemId: id },
    orderBy: { created_at: "asc" },
  });

  if (existing.length > 0) {
    return res.json({
      success: true,
      round: Math.max(...existing.map((q) => q.round)),
      needs_more_information: existing.some((q) => !isAnswered(q)),
      questions: existing.map(formatAdaptiveQuestion),
    });
  }

  const { needs_more_information, questions } = await askAdaptiveQuestions(
    item,
    [],
    1,
    [],
  );

  const saved = questions.length
    ? await saveAdaptiveQuestions(id, item.category, questions, 1)
    : [];

  return res.json({
    success: true,
    round: 1,
    needs_more_information,
    questions: saved.map(formatAdaptiveQuestion),
  });
};

// Home / Other: validate and store answers, then ask for the next round if needed.
const submitAdaptiveAnswers = async (res, item, id, answers) => {
  const questions = await prisma.questions.findMany({
    where: { itemId: id },
    orderBy: { created_at: "asc" },
  });

  if (questions.length === 0) {
    return res.status(404).json({ message: "No questions found for this item" });
  }

  const pending = questions.filter((q) => !isAnswered(q));
  if (pending.length === 0) {
    return res.json({
      success: true,
      message: "All questions have already been answered.",
      round: Math.max(...questions.map((q) => q.round)),
      needs_more_information: false,
      questions: [],
    });
  }

  const byRef = new Map();
  pending.forEach((q) => {
    byRef.set(q.itemKey, q);
    byRef.set(q.id, q);
  });

  const updates = new Map(); // db id -> data
  for (const a of answers) {
    const q = byRef.get(a?.question_id);
    if (!q) {
      return res.status(400).json({
        message: `Unknown or already answered question: ${a?.question_id}`,
      });
    }
    if (updates.has(q.id)) {
      return res.status(400).json({ message: `Duplicate answer for ${q.itemKey}` });
    }

    if (a.skipped === true) {
      if (!q.optional) {
        return res.status(400).json({ message: `${q.itemKey} is required and cannot be skipped` });
      }
      updates.set(q.id, { skipped: true });
      continue;
    }

    const result = validateAnswer(q, a.answer);
    if (result.error) return res.status(400).json({ message: result.error });
    updates.set(q.id, { answer: result.value });
  }

  const missing = pending.filter((q) => !q.optional && !updates.has(q.id));
  if (missing.length > 0) {
    return res.status(400).json({
      message: `Please answer the required questions: ${missing.map((q) => q.itemKey).join(", ")}`,
    });
  }

  // optional questions left out of the submission count as skipped
  pending.forEach((q) => {
    if (!updates.has(q.id)) updates.set(q.id, { skipped: true });
  });

  await prisma.$transaction(
    [...updates].map(([qid, data]) =>
      prisma.questions.update({ where: { id: qid }, data }),
    ),
  );

  const round = Math.max(...questions.map((q) => q.round));
  let nextQuestions = [];

  if (round < MAX_QUESTION_ROUNDS) {
    try {
      const all = await prisma.questions.findMany({
        where: { itemId: id },
        orderBy: { created_at: "asc" },
      });
      const result = await askAdaptiveQuestions(
        item,
        all.filter(isAnswered),
        round + 1,
        all.map((q) => q.itemKey),
      );
      if (result.needs_more_information) {
        nextQuestions = await saveAdaptiveQuestions(
          id,
          item.category,
          result.questions,
          round + 1,
        );
      }
    } catch (err) {
      // answers are already saved; the user can still move on to task generation
      console.error(
        "Error generating follow-up questions:",
        err.response?.data || err.message,
      );
    }
  }

  return res.json({
    success: true,
    round: nextQuestions.length ? round + 1 : round,
    needs_more_information: nextQuestions.length > 0,
    questions: nextQuestions.map(formatAdaptiveQuestion),
  });
};

export const generateQuestions = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const item = await prisma.item.findUnique({
      where: { id },
      select: ITEM_CONTEXT_SELECT,
    });

    if (!item) return res.status(404).json({ message: "Item not found" });

    if (item.user_id !== userId) {
      return res.status(403).json({ message: "You do not have access to this item" });
    }

    if (!(await isUserPremium(userId))) {
      return res.status(403).json({
        success: false,
        premiumRequired: true,
        message: "Upgrade to Premium to generate maintenance questions.",
      });
    }

    if (item.category !== "Vehicle") {
      return await generateAdaptiveQuestionsForItem(res, item, id);
    }

    const existingQuestions = await prisma.questions.findMany({
      where: { itemId: id },
    });

    if (existingQuestions.length > 0) {
      return res.json({ success: true, questions: existingQuestions });
    }

    const currentDate = new Date().toISOString().split("T")[0];

    const prompt = `
You are Maintenance Genie, an expert automotive maintenance assistant specializing in
vehicle-specific maintenance history.

Your task is to analyze the provided vehicle information and generate a list of 5–10
maintenance history questions that are unique to this exact vehicle.

──────────────────────────────
INPUT VARIABLES
──────────────────────────────
Year: ${item.year_of_the_model || "Not available"}
Make: ${item.brand || "Not available"}
Model: ${item.model}
Engine: ${item.engine || "Not available"}
Transmission: ${item.transmission || "Not available"}
Drivetrain: ${item.drivetrain || "Not available"}
Current Mileage: ${item.current_mileage || "Not available"}
Current Date: ${currentDate}

──────────────────────────────
OBJECTIVE
──────────────────────────────
Determine which major maintenance items are unique to this specific vehicle based on
its year, make, model, engine, transmission, drivetrain, current mileage, vehicle age,
known manufacturer maintenance recommendations, well-documented reliability concerns,
and common high-mileage wear items.

The goal is NOT to build a maintenance schedule.
The goal IS to determine whether important vehicle-specific maintenance has already
been completed by asking the user a series of questions.

──────────────────────────────
DO NOT INCLUDE
──────────────────────────────
Do NOT generate questions regarding routine maintenance, including:
Engine oil changes, tire rotations, engine air filters, cabin air filters, brake pad
inspections, battery inspections, wiper blades, regular coolant changes, regular brake
fluid changes, or any standard maintenance already covered by the general maintenance
schedule.

──────────────────────────────
INCLUDE QUESTIONS FOR
──────────────────────────────
Questions must be generated ONLY from the following fixed list of maintenance items.
This list is closed — do not introduce, substitute, or invent any maintenance item
that is not explicitly on this list, even if you believe it is relevant to the vehicle.

- Water pumps
- Timing belts
- Timing chain inspections
- Radiator replacement
- Thermostat replacement
- Transfer case service
- Front differential service
- Rear differential service
- CVT fluid service
- Automatic transmission service
- Valve adjustments
- Turbocharger maintenance
- Supercharger maintenance
- Diesel fuel filters
- Hybrid battery cooling system service
- Suspension components
- Wheel bearings
- Ball joints
- Tie rod ends
- Control arm bushings
- Intake valve carbon cleaning
- PCV valve replacement
- Vehicle-specific wear items
- Manufacturer-specific major services
- Known high-failure components

Only include items from this list that are appropriate for THIS vehicle (based on
engine, drivetrain, transmission, and trim).

──────────────────────────────
RULES
──────────────────────────────
1. Generate between 5 and 10 questions.
2. Every question must be specific to the exact vehicle provided.
3. Never invent obscure or unsupported failures.
4. Only include maintenance items that are manufacturer recommended, widely accepted,
   well-documented reliability concerns, or common high-mileage wear items.
5. Do not duplicate routine maintenance.
6. Keep each question under 20 words.
7. Use language that an average vehicle owner will understand.
8. Every question must contain exactly these answer choices: Yes, No, Planned.
9. Include a short explanation describing why the question matters.
10. Include recommendations for every possible answer.
11. Every question MUST include a stable machine-readable ID.
12. IDs must always be lowercase, use snake_case, never include the vehicle year,
    make, model, or mileage, and never change for the same maintenance item.
13. IDs should describe the maintenance item itself (e.g. water_pump, timing_belt).
14. Include a human-readable maintenance item name (e.g. "Water Pump").
15. Include a priority level of High, Medium, or Low for every question.
16. Return ONLY valid JSON.
17. Do not include markdown.
18. Do not include explanations outside the JSON.
19. Prioritize quality over quantity. If fewer than 10 meaningful, vehicle-specific
    questions exist from the fixed list, return only the meaningful ones. Never
    generate filler questions, and never pull a question from outside the fixed list
    simply to reach 10.
20. Recommendations should be practical, conservative, and based on manufacturer
    guidance or widely accepted automotive maintenance practices. Never recommend
    unnecessary repairs.
21. If a maintenance item only applies to certain engines, drivetrains, trims, or
    transmissions, only include it when it applies to the provided vehicle.
22. Do not ask duplicate questions that cover the same maintenance item.
23. Recommendations should assume the user does not know the vehicle's service
    history unless otherwise indicated.
24. Do not generate a question for any maintenance item that is not explicitly named
    in the "INCLUDE QUESTIONS FOR" list. If no items from the list apply to this
    vehicle, return an empty "questions" array rather than substituting an unlisted item.

──────────────────────────────
RETURN THIS EXACT JSON FORMAT
──────────────────────────────
{
  "vehicle": {
    "year": "", "make": "", "model": "", "engine": "",
    "transmission": "", "drivetrain": "", "current_mileage": ""
  },
  "questions": [
    {
      "id": "water_pump",
      "maintenance_item": "Water Pump",
      "category": "Cooling System",
      "priority": "High",
      "question": "Has the water pump ever been replaced?",
      "reason": "The original water pump commonly wears with age and mileage.",
      "options": ["Yes", "No", "Planned"],
      "recommendations": {
        "yes": { "status": "Complete", "message": "No immediate action is recommended unless symptoms are present." },
        "no": { "status": "Recommended", "message": "Inspect the water pump and replace it if it is original or showing signs of wear." },
        "planned": { "status": "Planned", "message": "Continue monitoring for leaks or bearing noise until replacement is completed." }
      }
    }
  ]
}
    `.trim();

    const response = await openAiPost(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}`,
        },
      },
    );

    let raw = response.data.choices[0].message.content.trim();

    if (raw.startsWith("```")) {
      raw = raw
        .replace(/^```(?:json)?/, "")
        .replace(/```$/, "")
        .trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse questions JSON from GPT:", raw);
      return res.status(500).json({ message: "Invalid JSON response from AI" });
    }

    const questionList = parsed.questions || [];

    const created = await prisma.$transaction(
      questionList.map((q) =>
        prisma.questions.create({
          data: {
            itemId: id,
            itemKey: q.id,
            maintenanceItem: q.maintenance_item,
            category: q.category,
            priority: q.priority,
            question: q.question,
            reason: q.reason,
            // userAnswer is optional and filled in later by submitAnswers
          },
        }),
      ),
    );

    return res.json({ success: true, questions: created });
  } catch (error) {
    console.error("Error generating questions:", error.response?.data || error.message);
    return res.status(500).json({ message: "Failed to generate questions" });
  }
};

export const submitAnswers = async (req, res) => {
  try {
    const { id } = req.params; // itemId
    const { answers } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: "answers must be a non-empty array" });
    }

    // Confirm the item exists and belongs to this user
    const item = await prisma.item.findUnique({
      where: { id },
      select: ITEM_CONTEXT_SELECT,
    });

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (item.user_id !== userId) {
      return res.status(403).json({ message: "You do not have access to this item" });
    }

    if (!(await isUserPremium(userId))) {
      return res.status(403).json({
        success: false,
        premiumRequired: true,
        message: "Upgrade to Premium to submit answers and receive recommendations.",
      });
    }

    if (item.category !== "Vehicle") {
      return await submitAdaptiveAnswers(res, item, id, answers);
    }

    // Fetch this item's questions in a stable, predictable order
    const questions = await prisma.questions.findMany({
      where: { itemId: id },
      orderBy: { created_at: "asc" },
      include: { recommendations: true },
    });

    if (questions.length === 0) {
      return res.status(404).json({ message: "No questions found for this item" });
    }

    // If any question already has an answer/recommendation, this item has
    // already been processed once — don't regenerate, just return what exists
    const alreadyAnswered = questions.some(
      (q) => q.userAnswer !== null || q.recommendations.length > 0,
    );

    if (alreadyAnswered) {
      return res.json({
        success: true,
        message: "Answers already submitted for this item.",
        questions,
      });
    }

    if (answers.length !== questions.length) {
      return res.status(400).json({
        message: `Expected ${questions.length} answers, received ${answers.length}`,
      });
    }

    // Normalize casing to match the OptionType enum exactly (Yes / No / Planned)
    const normalizeAnswer = (val) => {
      const map = { yes: "Yes", no: "No", planned: "Planned" };
      const normalized = map[String(val).toLowerCase()];
      return normalized || null;
    };

    const normalizedAnswers = answers.map(normalizeAnswer);

    if (normalizedAnswers.includes(null)) {
      return res.status(400).json({
        message: "Invalid answer value — must be Yes, No, or Planned (any casing)",
      });
    }

    // Pair each question with its corresponding answer by index
    const pairs = questions.map((q, i) => ({
      question: q,
      answer: normalizedAnswers[i],
    }));

    const prompt = `
You are Maintenance Genie, an expert automotive maintenance assistant.

For each maintenance question below, the vehicle owner has provided an answer
(Yes, No, or Planned). Generate a practical, conservative recommendation for
each one based on their answer.

──────────────────────────────
RULES
──────────────────────────────
1. Return exactly one recommendation per question, in the same order provided.
2. Each recommendation must include a "status" (e.g. "Complete", "Recommended",
   "Planned", "Attention Needed") and a "message" giving practical next-step
   guidance in plain language.
3. Recommendations should be based on manufacturer guidance or widely accepted
   automotive maintenance practices. Never recommend unnecessary repairs.
4. If the answer is "Yes", assume the maintenance was already done and confirm
   no further action is needed unless symptoms are present.
5. If the answer is "No", recommend inspecting/servicing the item, with urgency
   reflecting the question's priority.
6. If the answer is "Planned", acknowledge the plan and advise what to monitor
   in the meantime.
7. Return ONLY valid JSON. No markdown. No text outside the JSON.

──────────────────────────────
QUESTIONS AND ANSWERS
──────────────────────────────
${pairs
  .map(
    (p, i) => `
${i + 1}. ID: ${p.question.itemKey}
Maintenance Item: ${p.question.maintenanceItem}
Question: ${p.question.question}
Reason: ${p.question.reason}
User Answer: ${p.answer}
`,
  )
  .join("\n")}

──────────────────────────────
RETURN THIS EXACT JSON FORMAT
──────────────────────────────
{
  "recommendations": [
    {
      "id": "water_pump",
      "status": "Recommended",
      "message": "Inspect the water pump and replace it if it is original or showing signs of wear."
    }
  ]
}
    `.trim();

    const response = await openAiPost(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}`,
        },
      },
    );

    let raw = response.data.choices[0].message.content.trim();

    if (raw.startsWith("```")) {
      raw = raw
        .replace(/^```(?:json)?/, "")
        .replace(/```$/, "")
        .trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse recommendations JSON from GPT:", raw);
      return res.status(500).json({ message: "Invalid JSON response from AI" });
    }

    const recList = parsed.recommendations || [];

    const recByKey = {};
    recList.forEach((r) => {
      recByKey[r.id] = r;
    });

    const operations = pairs.flatMap(({ question, answer }) => {
      const rec = recByKey[question.itemKey];

      const updateAnswer = prisma.questions.update({
        where: { id: question.id },
        data: { userAnswer: answer },
      });

      if (!rec) {
        return [updateAnswer];
      }

      const upsertRecommendation = prisma.recommendation.upsert({
        where: {
          questionId_option: { questionId: question.id, option: answer },
        },
        update: {
          status: rec.status,
          message: rec.message,
        },
        create: {
          questionId: question.id,
          option: answer,
          status: rec.status,
          message: rec.message,
        },
      });

      return [updateAnswer, upsertRecommendation];
    });

    await prisma.$transaction(operations);

    const updatedQuestions = await prisma.questions.findMany({
      where: { itemId: id },
      include: { recommendations: true },
    });

    return res.json({ success: true, questions: updatedQuestions });
  } catch (error) {
    console.error("Error submitting answers:", error.response?.data || error.message);
    return res.status(500).json({ message: "Failed to submit answers" });
  }
};

// export const generateTasks = async (req, res) => {
//   try {
//     const { id: taskId } = req.params;
//     const { answers } = req.body;

//     if (!req.user?.userId) {
//       return res.status(400).json({ message: "User ID is required" });
//     }

//     if (!answers || !Array.isArray(answers) || answers.length === 0) {
//       return res.status(400).json({ message: "Answers are required" });
//     }

//     // if taskes already exist for this item, return those tasks
//     const existingTasks = await prisma.tasks.findMany({
//       where: { item_id: taskId },
//     });
//     if (existingTasks.length > 0) {
//       return res.json({ success: true, tasks: existingTasks });
//     }

//     const item = await prisma.item.findUnique({ where: { id: taskId } });
//     if (!item) return res.status(404).json({ message: "Item not found" });

//     const questionRecord = await prisma.questions.findUnique({
//       where: { itemId: taskId },
//       select: { question: true },
//     });

//     if (!questionRecord?.question) {
//       return res
//         .status(404)
//         .json({ message: "Question not found for this Task ID" });
//     }

//     const questions = Array.isArray(questionRecord.question)
//       ? questionRecord.question
//       : [questionRecord.question];

//     if (answers.length !== questions.length) {
//       return res.status(400).json({
//         message: "Number of answers must match number of questions",
//       });
//     }

//     const user = await prisma.user.findUnique({
//       where: { id: item.user_id },
//       select: { is_subscribed: true, role: true },
//     });

//     if (!user || (!user.is_subscribed && user.role !== "premium")) {
//       return res.json({
//         success: false,
//         message: "Oops, need subscription to create tasks",
//       });
//     }

//     const hasNo = answers.some((ans) => ans.toUpperCase() === "NO");
//     if (!hasNo) {
//       return res.json({ success: true, message: "No tasks needed" });
//     }

//     const pairedQA = questions.map((q, i) => ({
//       question: q,
//       answer: answers[i],
//     }));

//     const prompt = `
// You are a maintenance diagnostic assistant.
// Below are diagnostic questions with the user's YES/NO answers:

// ${pairedQA.map((q, i) => `${i + 1}. ${q.question} → ${q.answer}`).join("\n")}

// For each "NO" answer, generate one maintenance task with:
// - task_name
// - description (brief, 1-2 sentences)
// - due_in_days
// - shop_suggestions: [{ name, rating, total_reviews, contact, google_map_url }]

// Return ONLY valid JSON array of tasks. Example:
// [
//   {
//     "task_name": "Replace Engine Oil",
//     "description": "Oil level was low. Replace engine oil soon.",
//     "due_in_days": 7,
//     "shop_suggestions": [
//       {
//         "name": "AutoCare Center",
//         "rating": 4.7,
//         "total_reviews": 230,
//         "contact": "xxx-xxx-xxxx",
//         "google_map_url": "https://maps.google.com/?q=AutoCare+Center"
//       }
//     ]
//   }
// ]

// If all answers are "YES", respond with an empty array [].
// `;

//     const aiResponse = await axios.post(
//       "https://api.openai.com/v1/chat/completions",
//       {
//         model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4-turbo",
//         messages: [{ role: "user", content: prompt }],
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}`,
//         },
//       },
//     );

//     let raw = aiResponse.data.choices[0].message.content.trim();

//     // Remove code fences or extra characters
//     raw = raw
//       .replace(/^```(?:json)?/i, "")
//       .replace(/```$/, "")
//       .trim();

//     let tasks;
//     try {
//       tasks = JSON.parse(raw);
//     } catch (err) {
//       console.error("❌ Failed to parse GPT JSON:", raw);
//       return res.status(500).json({ message: "Invalid JSON from AI" });
//     }

//     // If GPT returns no tasks
//     if (!Array.isArray(tasks) || tasks.length === 0) {
//       return res.json({ success: true, message: "No tasks needed" });
//     }

//     // ✅ Store tasks in DB
//     const createdTasks = await Promise.all(
//       tasks.map((t) =>
//         prisma.tasks.create({
//           data: {
//             item_name: item.name,
//             upcoming_task: t.task_name,
//             description: t.description,
//             last_date: new Date(Date.now() + (t.due_in_days || 7) * 86400000),
//             item: { connect: { id: item.id } },
//             user: { connect: { id: item.user_id } },
//             shop_suggestions: t.shop_suggestions || [],
//           },
//         }),
//       ),
//     );

//     console.log(`✅ Created ${createdTasks.length} tasks`);
//     return res.json({ success: true, tasks: createdTasks });
//   } catch (error) {
//     console.error("🔥 Error generating tasks:", error);
//     return res.status(500).json({ message: "Failed to generate tasks" });
//   }
// };
export const generateTasks = async (req, res) => {
  try {
    const { id } = req.params; // itemId
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const item = await prisma.item.findUnique({
      where: { id },
      select: ITEM_CONTEXT_SELECT,
    });

    if (!item) return res.status(404).json({ message: "Item not found" });

    if (item.user_id !== userId) {
      return res.status(403).json({ message: "You do not have access to this item" });
    }

    if (!(await isUserPremium(userId))) {
      return res.status(403).json({
        success: false,
        premiumRequired: true,
        message: "Upgrade to Premium to generate maintenance tasks.",
      });
    }

    // Only generate once per item
    const existingTasks = await prisma.tasks.findMany({
      where: { item_id: id },
    });

    if (existingTasks.length > 0) {
      return res.json({ success: true, tasks: existingTasks });
    }

    const currentDate = new Date().toISOString().split("T")[0];

    const vehiclePrompt = `
You are Maintenance Genie, a vehicle maintenance schedule generator.
Your job is to create a standard maintenance schedule based on the provided vehicle
information.

Input variables:
- Year: ${item.year_of_the_model || "Not available"}
- Make: ${item.brand || "Not available"}
- Model: ${item.model || "Not available"}
- Engine: ${item.engine || "Not available"}
- Current Mileage: ${item.current_mileage || "Not available"}
- Current Date: ${currentDate}
- Average Miles Driven Per Year: ${item.average_mileage_per_year || 0}
- User Notes: ${item.user_notes || "None"}

Instructions:
Generate a practical maintenance schedule for this vehicle based on the current
mileage, vehicle age, and average annual mileage.

Include common maintenance tasks such as:
- Engine oil and filter
- Tire rotation
- Engine air filter
- Cabin air filter
- Brake inspection
- Battery inspection
- Coolant service
- Transmission fluid service
- Differential fluid service, if applicable
- Transfer case fluid service, if applicable
- Spark plugs
- Serpentine belt
- Brake fluid
- Power steering fluid, if applicable
- Wiper blades
- Tires
- General inspection

Rules:
- Return valid JSON only.
- Do not include markdown.
- Do not include text outside the JSON.
- Do not invent exact manufacturer service intervals unless they are widely known and
confidently applicable.
- If the exact interval is uncertain, use a conservative general interval and set
"manufacturer_interval_uncertain" to true.
- If the vehicle has special systems, such as hybrid drive, AWD, 4WD, diesel engine,
turbocharger, timing belt, CVT, or severe-duty use, include relevant maintenance items
when applicable.
- Use the current mileage and average miles driven per year to estimate the next due
mileage and next due date.
- If average miles driven per year is missing or zero, calculate mileage-based due items
only and set due date to "Unknown."
- Mark items as "Due Now", "Upcoming", "Future", or "Overdue".
- Prioritize safety-related items such as brakes, tires, steering, and suspension.
- Use plain language.
- Always recommend verifying exact intervals, fluid specifications, torque specs, and
part numbers with the owner's manual or service manual.

Return this exact JSON structure:
{
  "vehicle": {
    "year": "${item.year_of_the_model || ""}",
    "make": "${item.brand || ""}",
    "model": "${item.model || ""}",
    "engine": "${item.engine || ""}",
    "current_mileage": "${item.current_mileage || ""}",
    "current_date": "${currentDate}",
    "average_miles_per_year": "${item.average_mileage_per_year || ""}"
  },
  "schedule_summary": "",
  "maintenance_items": [
    {
      "task": "",
      "category": "",
      "recommended_interval": "",
      "last_service_assumption": "",
      "next_due_mileage": "",
      "next_due_date": "",
      "status": "",
      "priority": "",
      "manufacturer_interval_uncertain": true,
      "notes": ""
    }
  ],
  "immediate_attention_items": [],
  "upcoming_items": [],
  "future_items": [],
  "manual_check_required": true,
  "manual_check_reason": "Exact service intervals, fluid specifications, capacities, part
numbers, and torque specifications should be verified with the owner's manual or
service manual."
}
    `.trim();

    // Home / Other schedules are built from the details plus every answer given.
    let prompt = vehiclePrompt;
    if (item.category === "Vehicle") {
      // Vehicle answers (Yes / No / Planned) adjust the schedule.
      const vehicleAnswers = await prisma.questions.findMany({
        where: { itemId: id, userAnswer: { not: null } },
        orderBy: { created_at: "asc" },
      });

      if (vehicleAnswers.length > 0) {
        prompt = `${vehiclePrompt}

──────────────────────────────
OWNER'S MAINTENANCE HISTORY ANSWERS
──────────────────────────────
${vehicleAnswers
  .map(
    (q) =>
      `- ${q.maintenanceItem || q.itemKey}: ${q.question} -> ${q.userAnswer}`,
  )
  .join("\n")}

How to use these answers:
- "Yes": the service was already done. Do NOT create a task for it. If it matches a
  standard task, set last_service_assumption to "Reported done by owner" and push the
  next due date out accordingly.
- "No": the service has not been done. Create a task for it and raise its priority
  (and mark it "Due Now" or "Overdue" when the mileage or age warrants it).
- "Planned": create the task with status "Upcoming".
- Items not covered by these answers follow the normal schedule rules above.`;
      }
    } else {
      const answered = await prisma.questions.findMany({
        where: { itemId: id },
        orderBy: { created_at: "asc" },
      });
      prompt = buildTaskPrompt(
        item,
        answered.filter((q) => q.answer !== null || q.skipped),
      );
    }

    const response = await openAiPost(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}`,
        },
      },
    );

    let raw = response.data.choices[0].message.content.trim();

    if (raw.startsWith("```")) {
      raw = raw
        .replace(/^```(?:json)?/, "")
        .replace(/```$/, "")
        .trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse tasks JSON from GPT:", raw);
      return res.status(500).json({ message: "Invalid JSON response from AI" });
    }

    // tasks are unique per (item, name); drop repeats the AI may return
    const seenTasks = new Set();
    const maintenanceItems = (parsed.maintenance_items || []).filter((m) => {
      const key = String(m?.task || "").trim().toLowerCase();
      if (!key || seenTasks.has(key)) return false;
      seenTasks.add(key);
      return true;
    });

    // Map GPT's status strings to the Task_Status enum
    const statusMap = {
      "due now": "DueNow",
      "upcoming": "Upcoming",
      "future": "Future",
      "overdue": "Overdue",
    };

    const mapStatus = (val) => {
      const mapped = statusMap[String(val || "").toLowerCase()];
      return mapped || "DueNow"; // fallback if GPT returns something unexpected
    };

    // Map GPT's priority strings to the Task_Priority enum
    const priorityMap = { high: "High", medium: "Medium", low: "Low" };
    const mapPriority = (val) => {
      const mapped = priorityMap[String(val || "").toLowerCase()];
      return mapped || null;
    };

    // Parse next_due_date — GPT may return "Unknown" or a real date string
    const parseDueDate = (val) => {
      if (!val || val === "Unknown") return null;
      const parsed = new Date(val);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const created = await prisma.$transaction(
      maintenanceItems.map((m) =>
        prisma.tasks.create({
          data: {
            item_id: id,
            user_id: userId,
            item_name: item.name,
            upcoming_task: m.task,
            description: m.notes || null,
            category: m.category || null,
            recommended_interval: m.recommended_interval || null,
            last_service_assumption: m.last_service_assumption || null,
            next_due_mileage: m.next_due_mileage || null,
            next_due_date: m.next_due_date || null,
            // real timestamp for the reminder cron; a lone Other task (a one-time
            // task) falls back to the due date the user entered
            due_at:
              toDueAt(m.next_due_date) ??
              (item.category === "Custom" && maintenanceItems.length === 1
                ? item.due_date
                : null),
            priority: mapPriority(m.priority),
            manufacturer_interval_uncertain:
              m.manufacturer_interval_uncertain !== false,
            status: mapStatus(m.status),
          },
        }),
      ),
    );

    // AI-suggested shops near the user for each kind of task. Skipped when no
    // location is known; a failure never fails the request.
    let tasksOut = created;
    if (created.length > 0) {
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { city: true, state: true, postal_code: true, country: true },
      });
      const location = resolveShopLocation({ body: req.body, item, user: owner });
      const shopsByCategory = await findShopsForTasks(created, item.category, location);

      if (shopsByCategory.size > 0) {
        await prisma.$transaction(
          [...shopsByCategory].map(([category, shops]) =>
            prisma.tasks.updateMany({
              where: { item_id: id, category },
              data: { shop_suggestions: shops },
            }),
          ),
        );
        tasksOut = created.map((t) => ({
          ...t,
          shop_suggestions: shopsByCategory.get(t.category) ?? t.shop_suggestions,
        }));
      }
    }

    if (created.length > 0) {
      notifyUser(userId, {
        title: "Your tasks are ready",
        body: `${created.length} maintenance task${created.length === 1 ? "" : "s"} created for ${item.name}.`,
        type: NOTIFICATION_TYPES.TASKS_CREATED,
        entityId: id,
        data: { itemId: id, count: created.length },
      });
    }

    return res.json({ success: true, tasks: tasksOut });
  } catch (error) {
    console.error("Error generating tasks:", error.response?.data || error.message);
    return res.status(500).json({ message: "Failed to generate tasks" });
  }
};

export const uploadReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const task = await prisma.tasks.findUnique({ where: { id } });

    if (!task) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
      return res.status(404).json({ message: "Task not found" });
    }

    const localPath = path.join(__dirname, "../../uploads", req.file.filename);
    const resizedImageBuffer = await sharp(localPath)
      .resize({ width: 1000 })
      .toBuffer();

    const base64Image = `data:image/png;base64,${resizedImageBuffer.toString("base64")}`;

    const ocrResult = await Tesseract.recognize(resizedImageBuffer, "eng");
    const extractedText = ocrResult.data.text.trim();

    // console.log("OCR Extracted Text:", extractedText.slice(0, 500));

    const prompt = `
You are looking at a scanned maintenance or service receipt. Here's the extracted text:

"""
${extractedText}
"""

From this, identify any services or maintenance tasks that were performed — even if it's just a car wash.

Please return up to 5 services in this format:

{
  "maintenance_history": [
    "Service Name: mm/dd/yyyy"
  ]
}

If a date is not present, use "unknown date".  
If you can't find any services, respond with: { "maintenance_history": [] }
`;

    const gptResponse = await openAiPost(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: base64Image,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    let raw = gptResponse.data.choices[0].message.content.trim();

    if (raw.startsWith("```")) {
      raw = raw
        .replace(/^```(?:json)?/, "")
        .replace(/```$/, "")
        .trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("JSON parse failed:", raw);
      return res.status(422).json({
        message:
          "Invalid JSON returned from GPT. Please reupload a clearer image.",
      });
    }

    const history = parsed.maintenance_history || [];

    if (!history.length) {
      return res.status(400).json({
        message: "Could not extract readable data. Please try another receipt.",
      });
    }

    const updatedTask = await prisma.tasks.update({
      where: { id },
      data: {
        maintenance_history: history,
        receipt_url: req.file.filename,
        last_date: new Date(),
      },
    });

    return res.json({
      success: true,
      message: "Receipt uploaded and maintenance history updated.",
      task: updatedTask,
      receiptUrl: `http://localhost:8070/uploads/${req.file.filename}`,
    });
  } catch (error) {
    console.error("Error in uploadReceipt:", error.response?.data || error.message);

    if (req.file) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
    }

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

//need to work in here
export const updateStatusOfTask = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("id", id);
    const userId = req.user?.userId;
    console.log("userId", userId);
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const task = await prisma.tasks.findUnique({
      where: { id: id },
      select: { id: true, status: true, user_id: true },
    });

    console.log(task.user_id);

    // user is owner of the task
    if (userId !== task.user_id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this task" });
    }

    if (!id) {
      return res.status(400).json({ message: "Task ID is required" });
    }

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const newStatus = task.status === "Due" ? "Completed" : "Due";

    const updatedTask = await prisma.tasks.update({
      where: { id: id },
      data: { status: newStatus },
    });

    return res.status(200).json({
      message: "Task status updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    console.error("Error updating task status:", error.response?.data || error.message);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
// get all completed task for an user
export const getAllcomletedTasksForUser = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const tasks = await prisma.tasks.findMany({
      where: { user_id: userId, status: "Completed" },
      orderBy: { created_at: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "Completed Tasks retrieved successfully",
      tasks,
    });
  } catch (error) {
    console.error("Error retrieving completed tasks:", error.response?.data || error.message);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

export const getAllItems = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const items = await prisma.item.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });

    if (items.length === 0) {
      return res.status(404).json({ message: "No items found for this user" });
    }

    return res.status(200).json({
      success: true,
      message: "Items retrieved successfully",
      items: items.map(toItemSummary),
    });
  } catch (error) {
    console.error("Error retrieving items:", error.response?.data || error.message);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
export const getItemById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Item ID is required" });
    }

    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (item.user_id !== req.user?.userId) {
      return res.status(403).json({ message: "You do not have access to this item" });
    }

    return res.status(200).json({
      success: true,
      message: "Item retrieved successfully",
      item: { ...toItemDetail(item), user: item.user },
    });
  } catch (error) {
    console.error("Error retrieving item:", error.response?.data || error.message);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
export const getAllTasksForAnItem = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Item ID is required" });
    }
    const tasks = await prisma.tasks.findMany({
      where: { item_id: id },
      orderBy: { created_at: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "Tasks retrieved successfully",
      tasks,
    });
  } catch (error) {
    console.error("Error retrieving tasks:", error.response?.data || error.message);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

//New route to change the status of a task
export const changeTaskStatus = async (req, res) => {
  try {
    const { id } = req.params; // taskId
    const { status } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!status) {
      return res.status(400).json({ message: "status is required" });
    }

    const validStatuses = ["DueNow", "Upcoming", "Future", "Overdue", "Complete"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const task = await prisma.tasks.findUnique({
      where: { id },
      select: { user_id: true },
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.user_id !== userId) {
      return res.status(403).json({ message: "You do not have access to this task" });
    }

    const updatedTask = await prisma.tasks.update({
      where: { id },
      data: {
        status,
        // If marking complete, also stamp the last_date so it reflects when it was done
        ...(status === "Complete" ? { last_date: new Date() } : {}),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Task status updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    console.error("Error updating task status:", error.response?.data || error.message);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};


export const getAlltasksForAuser = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const tasks = await prisma.tasks.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });
    return res.status(200).json({
      success: true,
      message: "Tasks retrieved successfully",
      tasks,
    });
  } catch (error) {
    console.error("Error retrieving tasks:", error.response?.data || error.message);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};


//delete a task for an user
export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Task ID is required" });
    }
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const task = await prisma.tasks.findUnique({ where: { id } });
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    if (task.user_id !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this task" });
    }
    await prisma.tasks.delete({ where: { id } });
    return res
      .status(200)
      .json({ success: true, message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error.response?.data || error.message);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
//delete an item for an user
export const deleteItem = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "Item ID is required" });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (item.user_id !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this item" });
    }

    // Delete related data first
    await prisma.tasks.deleteMany({ where: { item_id: id } });
    await prisma.questions.deleteMany({ where: { itemId: id } });

    // Now delete the item
    await prisma.item.delete({ where: { id } });

    return res
      .status(200)
      .json({ success: true, message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting item:", error.response?.data || error.message);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
