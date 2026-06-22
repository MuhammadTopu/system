import dotenv from "dotenv";
import validator from "validator";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import axios from "axios";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { itemSchema } from "../validations/joi.validations.js";
dotenv.config();

const prisma = new PrismaClient();
const { sign, verify } = pkg;
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generateItemData = async (item) => {
  try {
    const serviceIntervalPrompt = `
      Based on the following item details, generate recommended service intervals:
      - Category: ${item.category || "Unspecified"}
      - Brand: ${item.brand}
      - Model: ${item.model}
      - Total Mileage: ${item.total_mileage}
      - Purchase Date: ${item.purchase_date}
      Please provide a list of recommended service intervals (e.g., every X miles or every Y months).

      if its not a vehicle, provide general maintenance intervals.
      Make the intervals specific to the brand and model where possible.
      Respond in a concise bullet-point format.
    `;

    const forumSuggestionPrompt = `
      Based on the following item details, suggest related forums:
      - Category: ${item.category || "Unspecified"}
      - Brand: ${item.brand}
      - Model: ${item.model}
      Please suggest 3-5 forum suggestions for discussions related to this item.
      check the country specific forums as well.
      Respond in a concise bullet-point format.
      If no relevant forums are found, respond with "No forums found".
    `;

    const serviceIntervalResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: serviceIntervalPrompt },
        ],
        max_tokens: 250,
        temperature: 0.7,
      },
      {
        headers: { Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}` },
      },
    );

    const forumSuggestionResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: forumSuggestionPrompt },
        ],
        max_tokens: 250,
      },
      {
        headers: { Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}` },
      },
    );

    let forumSuggestions = [];
    if (
      forumSuggestionResponse.data &&
      forumSuggestionResponse.data.choices &&
      forumSuggestionResponse.data.choices[0].message
    ) {
      forumSuggestions =
        forumSuggestionResponse.data.choices[0].message.content.split("\n");
    }

    return {
      service_intervals:
        serviceIntervalResponse.data.choices[0].message.content.split("\n"),
      forum_suggestions: forumSuggestions,
    };
  } catch (error) {
    console.error("Error generating item data with openAi:", error);
    return null;
  }
};
export const addItem = async (req, res) => {
  try {
    const { error, value } = itemSchema.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const {
      name,
      category,
      brand,
      model,
      year_of_the_model,
      purchase_date,
      total_mileage,
    } = value;

    if(category != 'Home' && category != 'Vehicle' && category != 'Appliance' && category != 'Electronics' && category != 'Custom'){
      return res.status(400).json({ message: "Invalid category" });
    }

    const formattedPurchaseDate = purchase_date
      ? new Date(purchase_date)
      : null;
    // const formattedLastServiceDate = last_service_date ? new Date(last_service_date) : null;
    const mileage = total_mileage ? parseFloat(total_mileage) : null;

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { is_subscribed: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { is_subscribed, role } = user;

    // Create new item in the database
    const newItem = await prisma.item.create({
      data: {
        name,
        brand,
        model,
        purchase_date: formattedPurchaseDate,
        total_mileage: mileage,
        year_of_the_model,
        category,
        image_url: req.file ? req.file.filename : null,
        user_id: userId,
      },
    });

    let generatedData;

    // Generate additional data based on user subscription and role
    if (is_subscribed === true && role === "premium") {
      generatedData = await generateItemData(req.body);
    } else {
      const serviceIntervalPrompt = `
        Based on the following item details, generate recommended service intervals:
        - Category: ${category || "Unspecified"}
        - Brand: ${brand}
        - Model: ${model}
        - Total Mileage: ${total_mileage}
        - Purchase Date: ${purchase_date}
        Please provide a list of recommended service intervals (e.g., every X miles or every Y months).
      `;

      const serviceIntervalResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: process.env.CHAT_GPT_MODEL_NAME || "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: serviceIntervalPrompt },
          ],
          max_tokens: 200,
        },
        {
          headers: { Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY || process.env.CHAT_GPT_FALL_BACK_API_KEY}` },
        },
      );

      generatedData = {
        service_intervals:
          serviceIntervalResponse.data.choices[0].message.content.split("\n"),
      };
    }

    if (generatedData) {
      const updatedItem = await prisma.item.update({
        where: { id: newItem.id },
        data: {
          service_intervals: generatedData.service_intervals,
          forum_suggestions: generatedData.forum_suggestions || [],
        },
      });

      const imageUrl = req.file
        ? `http://localhost:8070/uploads/${req.file.filename}`
        : null;

      return res.status(201).json({
        success: true,
        message: "Item added successfully with generated data",
        item: updatedItem,
        imageUrl,
      });
    } else {
      return res
        .status(500)
        .json({ message: "Failed to generate additional data for item" });
    }
  } catch (error) {
    console.error("Error adding item:", error);

    if (req.file) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
    }

    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
export const generateQuestions = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await prisma.item.findUnique({
      where: { id },
      select: {
        category: true,
        brand: true,
        model: true,
        year_of_the_model: true,
        purchase_date: true,
      },
    });

    if (!item) return res.status(404).json({ message: "Item not found" });

    const questionss = await prisma.questions.findUnique({
      where: { itemId: id },
      select: { question: true },
    });

    if (questionss && questionss.question && questionss.question !== "") {
      return res.json({ success: true, questions: questionss.question });
    } else {
      const prompt = `
        Based on the following item details, generate 5 yes/no diagnostic questions about possible issues:
        - Category: ${item.category}
        - Brand: ${item.brand}
        - Model: ${item.model}
        - Purchase Date: ${item.purchase_date}
        - Year of making this model: ${item.year_of_the_model || "Not available"}
        Please respond in JSON array format: ["Question 1?", "Question 2?", ...]
        Make valid questions related to the ${item.category} ${item.brand} ${item.model} (${item.year_of_the_model}).
        For example, a car made in 2015 will have different issues than a car made in 2020.
        If the car was made in 2015, it may have common issues that everyone with that car model faces.
        According to that, generate relevant questions.
      `;

      const response = await axios.post(
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

      let questions;
      try {
        questions = JSON.parse(raw);
      } catch (err) {
        console.error("Failed to parse questions JSON from GPT:", raw);
        return res
          .status(500)
          .json({ message: "Invalid JSON response from AI" });
      }

      let savedQuestions;
      if (questionss) {
        savedQuestions = await prisma.questions.update({
          where: { itemId: id },
          data: { question: questions },
        });
      } else {
        savedQuestions = await prisma.questions.create({
          data: {
            question: questions,
            itemId: id,
          },
        });
      }

      return res.json({ success: true, questions: savedQuestions.question });
    }
  } catch (error) {
    console.error("Error generating questions:", error);
    return res.status(500).json({ message: "Failed to generate questions" });
  }
};
export const generateTasks = async (req, res) => {
  try {
    const { id: taskId } = req.params;
    const { answers } = req.body;

    if (!req.user?.userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: "Answers are required" });
    }

    // if taskes already exist for this item, return those tasks
    const existingTasks = await prisma.tasks.findMany({
      where: { item_id: taskId },
    });
    if (existingTasks.length > 0) {
      return res.json({ success: true, tasks: existingTasks });
    }

    const item = await prisma.item.findUnique({ where: { id: taskId } });
    if (!item) return res.status(404).json({ message: "Item not found" });

    const questionRecord = await prisma.questions.findUnique({
      where: { itemId: taskId },
      select: { question: true },
    });

    if (!questionRecord?.question) {
      return res
        .status(404)
        .json({ message: "Question not found for this Task ID" });
    }

    const questions = Array.isArray(questionRecord.question)
      ? questionRecord.question
      : [questionRecord.question];

    if (answers.length !== questions.length) {
      return res.status(400).json({
        message: "Number of answers must match number of questions",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: item.user_id },
      select: { is_subscribed: true, role: true },
    });

    if (!user || (!user.is_subscribed && user.role !== "premium")) {
      return res.json({
        success: false,
        message: "Oops, need subscription to create tasks",
      });
    }

    const hasNo = answers.some((ans) => ans.toUpperCase() === "NO");
    if (!hasNo) {
      return res.json({ success: true, message: "No tasks needed" });
    }

    const pairedQA = questions.map((q, i) => ({
      question: q,
      answer: answers[i],
    }));

    const prompt = `
You are a maintenance diagnostic assistant.
Below are diagnostic questions with the user's YES/NO answers:

${pairedQA.map((q, i) => `${i + 1}. ${q.question} → ${q.answer}`).join("\n")}

For each "NO" answer, generate one maintenance task with:
- task_name
- description (brief, 1-2 sentences)
- due_in_days
- shop_suggestions: [{ name, rating, total_reviews, contact, google_map_url }]

Return ONLY valid JSON array of tasks. Example:
[
  {
    "task_name": "Replace Engine Oil",
    "description": "Oil level was low. Replace engine oil soon.",
    "due_in_days": 7,
    "shop_suggestions": [
      {
        "name": "AutoCare Center",
        "rating": 4.7,
        "total_reviews": 230,
        "contact": "xxx-xxx-xxxx",
        "google_map_url": "https://maps.google.com/?q=AutoCare+Center"
      }
    ]
  }
]

If all answers are "YES", respond with an empty array [].
`;

    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4-turbo",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_GPT_API_KEY}`,
        },
      },
    );

    let raw = aiResponse.data.choices[0].message.content.trim();

    // Remove code fences or extra characters
    raw = raw
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();

    let tasks;
    try {
      tasks = JSON.parse(raw);
    } catch (err) {
      console.error("❌ Failed to parse GPT JSON:", raw);
      return res.status(500).json({ message: "Invalid JSON from AI" });
    }

    // If GPT returns no tasks
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.json({ success: true, message: "No tasks needed" });
    }

    // ✅ Store tasks in DB
    const createdTasks = await Promise.all(
      tasks.map((t) =>
        prisma.tasks.create({
          data: {
            item_name: item.name,
            upcoming_task: t.task_name,
            description: t.description,
            last_date: new Date(Date.now() + (t.due_in_days || 7) * 86400000),
            item: { connect: { id: item.id } },
            user: { connect: { id: item.user_id } },
            shop_suggestions: t.shop_suggestions || [],
          },
        }),
      ),
    );

    console.log(`✅ Created ${createdTasks.length} tasks`);
    return res.json({ success: true, tasks: createdTasks });
  } catch (error) {
    console.error("🔥 Error generating tasks:", error);
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

    const gptResponse = await axios.post(
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
    console.error("Error in uploadReceipt:", error);

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
    console.error("Error updating task status:", error);
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
    console.error("Error retrieving completed tasks:", error);
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
      select: {
        id: true,
        category: true,
        name: true,
        model: true,
      },
    });

    if (items.length === 0) {
      return res.status(404).json({ message: "No items found for this user" });
    }

    return res.status(200).json({
      success: true,
      message: "Items retrieved successfully",
      items,
    });
  } catch (error) {
    console.error("Error retrieving items:", error);
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

    // Append full image URL if it exists
    const formattedItem = {
      ...item,
      image_url: item.image_url
        ? `${process.env.MEDIA_URL}/uploads/${item.image_url}`
        : null,
    };

    return res.status(200).json({
      success: true,
      message: "Item retrieved successfully",
      item: formattedItem,
    });
  } catch (error) {
    console.error("Error retrieving item:", error);
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
    console.error("Error retrieving tasks:", error);
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
    console.error("Error retrieving tasks:", error);
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
    console.error("Error deleting task:", error);
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
    console.error("Error deleting item:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
