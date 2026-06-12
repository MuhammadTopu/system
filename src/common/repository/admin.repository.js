import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

class AdminRepository {
  // for log in

  // async findAdminByEmail(email) {
  //   return prisma.user.findFirst({
  //     where: {
  //       email,
  //       type: "ADMIN",
  //     },
  //   });
  // }

  //count users
  async countUsers() {
    return prisma.user.count({
      where: {
        type: "USER",
      },
    });
  }

  // for the subscription flow
  async getSubscribedUsersThisYear(startDate, endDate) {
    return prisma.user.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: endDate,
        },
        is_subscribed: true,
      },
      include: {
        Subscription: true,
      },
    });
  }

  async getMonthlyRevenue(startDate, endDate) {
    return prisma.subscription.aggregate({
      _sum: {
        price: true,
      },
      where: {
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  async getRevenueBetweenDates(startDate, endDate) {
    return prisma.subscription.aggregate({
      _sum: {
        price: true,
      },
      where: {
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  async countActiveSubscriptions({ userId, startDate, endDate }) {
    return prisma.user.count({
      where: {
        id: userId,
        type: "USER",
        role: "premium",
        is_subscribed: true,
        created_at: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  // async getAllUsers({ whereClause, sortByField, orderBy }) {
  //   return this.prisma.user.findMany({
  //     where: whereClause,
  //     include: {
  //       Subscription: {
  //         select: {
  //           plan: true,
  //         },
  //       },
  //     },
  //     orderBy:
  //       sortByField === "subscription_plan"
  //         ? {
  //             Subscription: {
  //               plan: orderBy,
  //             },
  //           }
  //         : {
  //             [sortByField]: orderBy,
  //           },
  //   });
  // }
async getAllUsers({ page = 1, limit = 10 }) {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: {
        type: "USER",
      },
      skip,
      take: limit,
      orderBy: {
        created_at: "desc",
      },
    }),

    prisma.user.count({
      where: {
        type: "USER",
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    users,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      nextPage: page < totalPages ? Number(page) + 1 : null,
      prevPage: page > 1 ? Number(page) - 1 : null,
    },
  };
}

  async getUsersForPdf() {
    return prisma.user.findMany({
      where: {
        type: "USER",
      },
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
  }

  async suspendUser(id) {
    return prisma.user.update({
      where: {
        id,
      },
      data: {
        status: "suspended",
      },
    });
  }

  async updateUserStatus(id, status) {
    return prisma.user.update({
      where: {
        id,
      },
      data: {
        status,
      },
    });
  }

  async getAllSubscriptions({ whereClause, sortByField, orderBy }) {
    return prisma.subscription.findMany({
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
        [sortByField]: orderBy,
      },
    });
  }
  async getSubscriptionsForPdf() {
    return prisma.subscription.findMany({
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
        created_at: "desc",
      },
    });
  }

  async getAllMailsRepo() {
    return await prisma.mail.findMany({
      orderBy: {
        created_at: "desc",
      },
    });
  }

  async findMailById(id) {
    return await prisma.mail.findUnique({
      where: { id },
    });
  }

  async updateMailStatus(id, status) {
    return await prisma.mail.update({
      where: { id },
      data: { status },
    });
  }

  async updateSettingsById(id, data) {
    return await prisma.general_Settings.update({
      where: { id },
      data,
    });
  }

  async getGeneralSettingsById(id) {
    const settings = await prisma.general_Settings.findUnique({
      where: { id },
    });

    if (!settings) {
      return { message: "Settings not found" };
    }
    return settings;
  }

  // get me
  async findUserById(userId) {
    return await prisma.user.findUnique({
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
  }

  // change passwords
  async findUserPasswordById(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
      },
    });
  }

  // Returns full user record including password for internal operations
  async findUserByIdWithPassword(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
    });
  }

  //   async findUserById(userId) {
  //   return await prisma.user.findUnique({
  //     where: { id: userId },
  //   });
  // }

  async updatePassword(userId, hashedPassword) {
    return await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  async findAdminById(id) {
    return await prisma.user.findUnique({
      where: {
        id,
        type: "ADMIN",
      },
    });
  }

  async updateAvatar(id, filename) {
    return await prisma.user.update({
      where: {
        id,
        type: "ADMIN",
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
      data: {
        avatar: filename,
      },
    });
  }

  /// for updating admin details
  async updateAdminById(id, data) {
    return await prisma.user.update({
      where: {
        id,
        type: "ADMIN",
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      data,
    });
  }

  async getAllAdmins() {
    return await prisma.user.findMany({
      where: { type: "ADMIN" },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        created_at: true,
      },
    });
  }
  async deleteAdminById(id) {
    return await prisma.user.delete({
      where: { id },
    });
  }

  async findAdminByEmail(email) {
    return await prisma.user.findFirst({
      where: {
        email,
        type: "ADMIN",
      },
    });
  }

  async createAdmin(data) {
    return await prisma.user.create({
      data,
    });
  }

  async createService(data) {
    return await prisma.services.create({
      data,
    });
  }

  async getAllServices() {
    return await prisma.services.findMany({
      orderBy: {
        created_at: "desc",
      },
    });
  }
}

export default AdminRepository;
