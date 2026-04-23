import dotenv from "dotenv";
import validator from 'validator';
import puppeteer from 'puppeteer';
import bcrypt from "bcryptjs";
import { upload } from '../../config/Multer.config.js';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { PrismaClient } from "@prisma/client";
import { sendAdminInvitationEmail } from "../../utils/mailService.js";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import { randomBytes } from "crypto";
import cookieParser from 'cookie-parser';
import { token } from "morgan";
import { type } from "os";
import { generateSubscriptionHtml, generateUserListHtml } from "../../constants/email_message.js";
import { create } from "domain";

const prisma = new PrismaClient();
const { sign, verify } = pkg;
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//--------------------------------------------------------admin login---------------------------------------------------------\\
//admin login
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const missingField = ['email', 'password'].find(field => !req.body[field]);
    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required!`,
      });
      return;
    }
    const user = await prisma.user.findUnique({
      where: {
        email,
        type: 'ADMIN',
      },
    });

    if (!user) {
      res.status(404).json({
        message: 'SORRY YOU ARE NOT REGISTERED AS ADMIN',
      });
      return;
    }


    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, type: user.type },
      process.env.JWT_SECRET,
      { expiresIn: '100d' }
    );

    console.log('Token expires at:', token);


    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.created_at,
        updatedAt: user.updatedAt,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Something went wrong',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
//--------------------------------------------------------home page------------------------------------------------------------\\
//total number of users
export const getTotalUsers = async (req, res) => {
  try {
    const totalUsers = await prisma.user.count({
      where: { type: 'USER' },
    });

    return res.status(200).json({
      success: true,
      message: "Total users retrieved successfully",
      data: { totalUsers },
    });
  } catch (error) {
    console.error('Error retrieving total users:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//chart data
export const getSubscriptionStats = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(400).json({ message: "User not authenticated" });

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    const monthsThisYear = [];
    for (let month = 0; month <= currentMonth; month++) {
      monthsThisYear.push(new Date(currentYear, month, 1));
    }

    const users = await prisma.user.findMany({
      where: {
        created_at: {
          gte: new Date(currentYear, 0, 1),
          lte: currentDate
        },
        is_subscribed: true,
      },
      include: { Subscription: true }
    });

    const series = [
      { name: "normal", data: Array(monthsThisYear.length).fill(0) },
      { name: "premium", data: Array(monthsThisYear.length).fill(0) }
    ];

    users.forEach(user => {
      const userMonth = user.created_at.getMonth();
      const userYear = user.created_at.getFullYear();

      if (userYear === currentYear) {
        const monthIndex = monthsThisYear.findIndex(
          date => date.getMonth() === userMonth
        );

        if (monthIndex !== -1) {
          if (user.role.toLowerCase() === 'normal') {
            series[0].data[monthIndex]++;
          } else if (user.role.toLowerCase() === 'premium') {
            series[1].data[monthIndex]++;
          }
        }
      }
    });
    return res.status(200).json({
      success: true,
      message: "Subscription statistics retrieved successfully",
      data: {
        series,

      },
    });
  } catch (error) {
    console.error('Error retrieving subscription statistics:', error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};
//monthly revenue
export const monthlyRevenue = async (req, res) => {
  try {
    const currentDate = new Date();
    const lastMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const lastMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

    const revenue = await prisma.subscription.aggregate({
      _sum: {
        price: true,
      },
      where: {
        created_at: {
          gte: lastMonthStart,
          lte: lastMonthEnd,
        },
      },
    });

    if(revenue._sum.price === null) {
      return res.status(200).json({success:true ,  data: { _sum: { price: 0 } } , message: "No revenue found for the last month" });
    }

    return res.status(200).json({
      success: true,
      message: "Monthly revenue retrieved successfully",
      data: revenue,
    });
  } catch (error) {
    console.error('Error retrieving monthly revenue:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
export const thisMonthRevenue = async (req, res) => {
  try {
    const currentDate = new Date();
    const thisMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const thisMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const revenue = await prisma.subscription.aggregate({
      _sum: {
        price: true,
      },
      where: {
        created_at: {
          gte: thisMonthStart,
          lte: thisMonthEnd,
        },
      },
    });

    if(revenue._sum.price === null) {
      return res.status(404).json({ data: {
        _sum: {
        price: 0
        }
      } });
    }

    return res.status(200).json({
      success: true,
      message: "This month's revenue retrieved successfully",
      data: revenue,
    });
  } catch (error) {
    console.error('Error retrieving this month\'s revenue:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}
//active subscription in the last month
export const activeSubscription = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const currentDate = new Date();
    const lastMonthStart = new Date(currentDate.setMonth(currentDate.getMonth() - 1));
    const lastMonthEnd = new Date();

    const activeSubscriptionsCount = await prisma.user.count({
      where: {
        type: 'USER',
        role: 'premium',
        id: userId,
        is_subscribed: true,
        created_at: {
          gte: lastMonthStart,
          lte: lastMonthEnd,
        },
      },
    });

    if (activeSubscriptionsCount === 0) {
      return res.status(200).json({success: true, data: { activeSubscriptionsCount: 0 , message: "No active subscriptions found for the last month" }});
    }

    return res.status(200).json({
      success: true,
      message: "Active subscription count for the last month retrieved successfully",
      data: { activeSubscriptionsCount },
    });
  } catch (error) {
    console.error('Error retrieving subscription status:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};


//--------------------------------------------------------user management----------------------------------------------------------\\
//get all users
export const getAllUsers = async (req, res) => {
  try {
    const {
      sortBy = 'created_at',
      order = 'desc',
      statusFilter,
      subscriptionFilter
    } = req.query;

    const validSortByFields = ['created_at', 'name', 'status', 'subscription_plan'];
    const validOrder = ['asc', 'desc'];
    const validStatusFilters = ['active', 'inactive'];
    const validSubscriptionFilters = ['HalfYearly', 'Yearly', 'NONE'];

    const sortByField = validSortByFields.includes(sortBy) ? sortBy : 'created_at';
    const orderBy = validOrder.includes(order) ? order : 'desc';
    const status = validStatusFilters.includes(statusFilter) ? statusFilter : undefined;
    const subscription = validSubscriptionFilters.includes(subscriptionFilter) ? subscriptionFilter : undefined;

    const whereClause = {
      type: 'USER',
      ...(status && { status }),
      ...(subscription && {
        Subscription: subscription === 'NONE'
          ? { none: {} }
          : { some: { plan: subscription } }
      })
    };

    const users = await prisma.user.findMany({
      where: whereClause,
      include: {
        Subscription: {
          select: {
            plan: true,
          },
        },
      },
      orderBy: sortByField === 'subscription_plan'
        ? { Subscription: { plan: orderBy } }
        : { [sortByField]: orderBy }
    });

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found matching your criteria"
      });
    }

    // Format the response to match UI needs
    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      subscription: user.Subscription?.plan || 'None',
      joinedDate: user.created_at,
      // Add any other fields needed for the UI
    }));

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: {
        users: formattedUsers,
        totalCount: users.length,
        // Add filter/sort metadata for UI
        filters: {
          status,
          subscription
        },
        sort: {
          by: sortByField,
          order: orderBy
        }
      },
    });
  } catch (error) {
    console.error('Error retrieving users:', error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};
//printlistpdf
export const printListPdf = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { type: 'USER' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        is_subscribed: true,
        created_at: true,
        Subscription: {
          select: {
            plan: true,
          },
        },
      },
    });

    if (users.length === 0) {
      return res.status(404).json({ message: "No users found" });
    }

    const htmlContent = generateUserListHtml(users);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent);

    const pdfBuffer = await page.pdf({
      format: 'A3',
      printBackground: true,
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="user_list.pdf"');
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating PDF:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//suspend a user
export const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id, type: 'USER' },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await prisma.user.update({
      where: { id, type: 'USER' },
      data: { status: 'suspended' },
    });

    return res.status(200).json({
      success: true,
      message: "User suspended successfully",
    });
  } catch (error) {
    console.error('Error suspending user:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//active a user
export const activateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id, type: 'USER' },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await prisma.user.update({
      where: { id, type: 'USER' },
      data: { status: 'active' },
    });

    return res.status(200).json({
      success: true,
      message: "User activated successfully",
    });
  } catch (error) {
    console.error('Error activating user:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

//--------------------------------------------------------subscriptions------------------------------------------------------------\\
//get all subscriptions
export const getAllsubscriptions = async (req, res) => {
  try {
    const {
      sortBy = 'created_at',
      order = 'desc',
      statusFilter,
      planFilter
    } = req.query;

    // Valid fields and values for sorting and filtering
    const validSortByFields = ['created_at', 'status', 'plan'];
    const validOrder = ['asc', 'desc'];
    const validStatusFilters = ['Active', 'Ended'];
    const validPlanFilters = ['HalfYearly', 'Yearly', 'NONE'];

    // Validate sorting parameters
    const sortByField = validSortByFields.includes(sortBy) ? sortBy : 'created_at';
    const orderBy = validOrder.includes(order) ? order : 'desc';

    // Apply filters
    const status = validStatusFilters.includes(statusFilter) ? statusFilter : undefined;
    const plan = validPlanFilters.includes(planFilter) ? planFilter : undefined;

    // Where clause to apply filters on status and plan
    const whereClause = {
      ...(status && { status }),
      ...(plan && { plan })
    };

    // Query subscriptions from database
    const subscriptions = await prisma.subscription.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        PaymentTransaction: {
          select: {
            id: true,
            payment_method: true,
            status: true,
          },
        },
      },
      orderBy: {
        [sortByField]: orderBy
      }
    });

    if (subscriptions.length === 0) {
      return res.status(404).json({ message: "No subscriptions found" });
    }

    const formattedSubscriptions = subscriptions.map(sub => {
      return {
        username: sub.user.name || 'N/A',
        user_id: sub.user.id,
        user_email: sub.user.email,
        plan: sub.plan,
        payment_method: sub.PaymentTransaction[0]?.payment_method || null,
        payment_transaction_id: sub.PaymentTransaction[0]?.id || null,
        status: sub.status,
        created_at: sub.created_at,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Subscriptions retrieved successfully",
      subscriptions: formattedSubscriptions,
      filters: {
        status,
        plan
      },
      sort: {
        by: sortByField,
        order: orderBy
      }
    });
  } catch (error) {
    console.error('Error retrieving subscriptions:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//get the subscription pdf
export const getSubscriptionPdf = async (req, res) => {
  try {
    const subscriptions = await prisma.subscription.findMany({
      select: {
        plan: true,
        status: true,
        created_at: true,
        PaymentTransaction: {
          select: {
            id: true,
            payment_method: true,
            status: true,
            price: true,
            created_at: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (subscriptions.length === 0) {
      return res.status(404).json({ message: "No subscriptions found" });
    }

    const htmlContent = generateSubscriptionHtml(subscriptions);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A3',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '5mm',
        bottom: '20mm',
        left: '5mm'
      }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="subscriptions_report.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating subscriptions PDF:', error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};
//---------------------------------------------------------feedbackand support-------------------------------------------------------------\\ 
//get all mails 
export const getAllMails = async (req, res) => {
  try {
    const mails = await prisma.mail.findMany({
      orderBy: {
        created_at: 'desc',
      },
    });

    if (mails.length === 0) {
      return res.status(404).json({ message: "No mails found" });
    }

    return res.status(200).json({
      success: true,
      message: "Mails retrieved successfully",
      data: mails,
    });
  } catch (error) {
    console.error('Error retrieving mails:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//change mail status
export const changeMailStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Mail ID is required" });
    }

    const mail = await prisma.mail.findUnique({
      where: { id },
    });

    if (!mail) {
      return res.status(404).json({ message: "Mail not found" });
    }

    const newStatus = mail.status === 'Pending' ? 'Solved' : 'Pending';

    const updatedMail = await prisma.mail.update({
      where: { id },
      data: { status: newStatus },
    });

    return res.status(200).json({
      success: true,
      message: `Mail status updated to ${newStatus} successfully`,
      data: updatedMail,
    });
  } catch (error) {
    console.error('Error updating mail status:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

//----------------------------------------------------------------create service----------------------------------------------------------------\\
//create service
export const createService = async (req, res) => {
  try {
    const { name, description, price, features, plan } = req.body;

    if (!name || !description || !price || !features || !plan) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const newService = await prisma.services.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        features: JSON.parse(features),
        plan,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: newService,
    });
  } catch (error) {
    console.error('Error creating service:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}
//get all services
export const getAllServices = async (req, res) => {
  try {
    const services = await prisma.services.findMany({
      orderBy: {
        created_at: 'desc',
      },
    });

    if (services.length === 0) {
      return res.status(404).json({ message: "No services found" });
    }

    return res.status(200).json({
      success: true,
      message: "Services retrieved successfully",
      data: services,
    });
  } catch (error) {
    console.error('Error retrieving services:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}

//-------------------------------------------------------------settings-----------------------------------------------------------------\\
//general settings 
export const updateSettings = async (req, res) => {
  try {
    const { description, contact_email, contact_phone, time_zone } = req.body;


    const setting = await prisma.general_Settings.update({
      where: { id: "cmcyniqg30000rej8ojyardm5" },
      data: {
        description,
        contact_email,
        contact_phone,
        time_zone,
      },
    });

    console.log('setting created:', setting);
    return res.status(201).json({
      success: true,
      message: "Setting created successfully",
      data: setting,
    });
  } catch (error) {
    console.error('Error creating setting:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}
//get general settings
export const getGeneralSettings = async (req, res) => {
  try {
    const setting = await prisma.general_Settings.findUnique({
      where: { id: "cmcyniqg30000rej8ojyardm5" },
    });

    if (!setting) {
      return res.status(404).json({ message: "Settings not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Settings retrieved successfully",
      data: setting,
    });
  } catch (error) {
    console.error('Error retrieving general settings:', error);
  }
}

//admin info
//get me
export const getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(400).json({ message: "User not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        created_at: true,
        type: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.error('Error retrieving user:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//change admin password
export const changeAdminPassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.userId;
    console.log('User ID:', userId);


    if (!oldPassword || !newPassword) {
      res.status(400).json({
        message: 'Old password and new password are required',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({
        message: 'User not found',
      });
      return;
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isOldPasswordValid) {
      res.status(401).json({
        message: 'Old password is incorrect',
      });
      return;
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Something went wrong',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
//change admin image
export const updateImage = async (req, res) => {

  try {
    const id = req.user?.userId;
    const newImage = req.file;

    if (!newImage) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: id, type: 'ADMIN' },
    });

    if (!existingUser) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", newImage.filename));
      return res.status(404).json({ message: "Admin not found" });
    }

    if (existingUser.avatar) {
      const oldImagePath = path.join(__dirname, "../../uploads", existingUser.avatar);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    const user = await prisma.user.update({
      where: { id: id, type: 'ADMIN' },
      data: {
        avatar: newImage.filename,
      },
    });

    const imageUrl = `http://localhost:8080/uploads/${newImage.filename}`;

    return res.status(200).json({
      success: true,
      message: "Image updated successfully",
      data: { ...user, imageUrl },


    });
  } catch (error) {
    console.error('Error during image upload:', error);

    if (req.file) {
      fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
//change admin details
export const updateAdminDetails = async (req, res) => {
  try {
    const { name, email } = req.body;
    const id = req.user?.userId;

    if (!id) {
      return res.status(400).json({ message: "Admin not authenticated" });
    }

    if (!id) {
      return res.status(400).json({ message: "Admin not authenticated" });
    }

    const dataToUpdate = {};

    if (name) dataToUpdate.name = name;
    if (email) dataToUpdate.email = email;

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }

    const user = await prisma.user.update({
      where: { id: id, type: 'ADMIN' },
      data: dataToUpdate,
    });

    return res.status(200).json({
      success: true,
      message: "User details updated successfully",
      data: user,
    });
  } catch (error) {
    console.error('Error updating user details:', error);

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//admins
//get all admins
export const getAllAdmins = async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { type: 'ADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        created_at: true,
      },
    });

    if (admins.length === 0) {
      return res.status(404).json({ message: "No admins found" });
    }

    return res.status(200).json({
      success: true,
      message: "Admins retrieved successfully",
      data: admins,
    });
  } catch (error) {
    console.error('Error retrieving admins:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//delete a admin
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Admin ID is required" });
    }

    if (id === 'undefined' ? req.user?.userId : id) {
      return res.status(400).json({ message: "  you cannot delete yourself" });
    }

    const admin = await prisma.user.findUnique({
      where: { id, type: 'ADMIN' },
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    await prisma.user.delete({
      where: { id, type: 'ADMIN' },
    });

    return res.status(200).json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (error) {
    console.error('Error deleting admin:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
//invite a admin
export const inviteAdmin = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isEmail(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const existingAdmin = await prisma.user.findUnique({
      where: { email, type: 'ADMIN' },
    });

    if (existingAdmin) {
      return res.status(400).json({ message: "Admin with this email already exists" });
    }

    const rawPassword = randomBytes(6).toString('base64');
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const addAdmin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        type: 'ADMIN',
      },
    });


    sendAdminInvitationEmail(email, rawPassword);

    return res.status(200).json({
      success: true,
      message: "Invitation sent successfully.",
      addAdmin
    });
  } catch (error) {
    console.error('Error inviting admin:', error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
