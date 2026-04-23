import dotenv from "dotenv";
import validator from 'validator';
import { upload } from '../../config/Multer.config.js';
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import axios from 'axios';

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
      - Category: ${item.category}
      - Brand: ${item.brand}
      - Model: ${item.model}
      - Total Mileage: ${item.total_mileage}
      - Purchase Date: ${item.purchase_date}
      Please provide a list of recommended service intervals (e.g., every X miles or every Y months).
    `;

    const forumSuggestionPrompt = `
      Based on the following item details, suggest related forums:
      - Category: ${item.category}
      - Brand: ${item.brand}
      - Model: ${item.model}
      Please suggest 3-5 forum suggestions for discussions related to this item.
    `;

    const serviceIntervalResponse = await axios.post(
      'https://api.together.xyz/v1/completions',
      {
        model: 'mistralai/Mistral-7B-Instruct-v0.1',
        prompt: serviceIntervalPrompt,
        max_tokens: 150,
      },
      {
        headers: { 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}` }
      }
    );

    let forumSuggestions = [];
    const forumSuggestionResponse = await axios.post(
      'https://api.together.xyz/v1/completions',
      {
        model: 'mistralai/Mistral-7B-Instruct-v0.1',
        prompt: forumSuggestionPrompt,
        max_tokens: 150,
      },
      {
        headers: { 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}` }
      }
    );

    if (forumSuggestionResponse.data && forumSuggestionResponse.data.choices && forumSuggestionResponse.data.choices[0].text) {
      forumSuggestions = forumSuggestionResponse.data.choices[0].text.split("\n");
    } else {
      console.error("Forum suggestions are empty or malformed:", forumSuggestionResponse.data);
      forumSuggestions = [];
    }


    return {
      service_intervals: serviceIntervalResponse.data.choices[0].text.split("\n"),
      forum_suggestions: forumSuggestions,
    };
  } catch (error) {
    console.error('Error generating item data with Mistral:', error);
    return null;
  }
};
export const addItem = async (req, res) => {
  try {
    const {
      name,
      brand,
      model,
      vin,
      price,
      image_url,
      purchase_date,
      total_mileage,
      last_service_date,
      last_service_name,
      category
    } = req.body;

    const formattedPurchaseDate = purchase_date ? new Date(purchase_date) : null;
    const formattedLastServiceDate = last_service_date ? new Date(last_service_date) : null;
    const mileage = total_mileage ? parseFloat(total_mileage) : null;

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { is_subscribed: true }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSubscribed = user.is_subscribed;
    console.log('User subscription status:', isSubscribed);

    const newItem = await prisma.item.create({
      data: {
        name,
        brand,
        model,
        vin,
        purchase_date: formattedPurchaseDate,
        total_mileage: mileage,
        last_service_date: formattedLastServiceDate,
        last_service_name,
        category,
        image_url: req.file ? req.file.filename : null,
        price,
        user_id: userId,
      },
    });


    // will also create the task here ------↴
    // const newTask = await prisma.tasks.create({
    //   data: {
    //     item_id: newItem.id,
    //     task_name: "First Service",
    //     task_description: "This is the first service task for your item.",
    //     due_date: formattedLastServiceDate ? new Date(formattedLastServiceDate.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
    //     status: "Pending",
    //   },
    // })
   
    console.log(newItem);


    let generatedData;

    if (isSubscribed === true) {

      generatedData = await generateItemData(req.body);
    } else {
      const serviceIntervalPrompt = `
        Based on the following item details, generate recommended service intervals:
        - Category: ${req.body.Category}
        - Brand: ${req.body.brand}
        - Model: ${req.body.model}
        - Total Mileage: ${req.body.total_mileage}
        - Purchase Date: ${req.body.purchase_date}
        Please provide a list of recommended service intervals (e.g., every X miles or every Y months).
      `;

      const serviceIntervalResponse = await axios.post(
        'https://api.together.xyz/v1/completions',
        {
          model: 'mistralai/Mistral-7B-Instruct-v0.1',
          prompt: serviceIntervalPrompt,
          max_tokens: 150,
        },
        {
          headers: { 'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}` }
        }
      );

      generatedData = {
        service_intervals: serviceIntervalResponse.data.choices[0].text.split("\n"),
      };
    }

    if (generatedData) {
      const updatedItem = await prisma.item.update({
        where: { id: newItem.id },
        data: {
          service_intervals: generatedData.service_intervals,
          forum_suggestions: generatedData.forum_suggestions,
        },
      });

      const imageUrl = req.file ? `http://localhost:8080/uploads/${req.file.filename}` : null;

      return res.status(201).json({
        success: true,
        message: "Item added successfully with generated data",
        item: updatedItem,
        imageUrl,
      });
    } else {
      return res.status(500).json({ message: "Failed to generate additional data for item" });
    }
  } catch (error) {
    console.error('Error adding item:', error);

    if (req.file) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
    }

    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};
//GET ALL ITEMS
export const getAllItems = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const items = await prisma.item.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        category: true,
        name: true,
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
    console.error('Error retrieving items:', error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};
//get one item by id
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
      image_url: item.image_url ? `http://localhost:8080/uploads/${item.image_url}` : null,
    };

    return res.status(200).json({
      success: true,
      message: "Item retrieved successfully",
      item: formattedItem,
    });
  } catch (error) {
    console.error('Error retrieving item:', error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};