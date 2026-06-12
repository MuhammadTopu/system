import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Create item
export const createItemRepo = async (data) => {
  return prisma.item.create({ data });
};

// Update item
export const updateItemRepo = async (id, data) => {
  return prisma.item.update({
    where: { id },
    data,
  });
};

// Get items by user
export const getItemsByUserRepo = async (userId) => {
  return prisma.item.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      category: true,
      name: true,
    },
  });
};

// Get item by id
export const getItemByIdRepo = async (id) => {
  return prisma.item.findUnique({
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
};

// Get user subscription
export const getUserByIdRepo = async (userId) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { is_subscribed: true },
  });
};