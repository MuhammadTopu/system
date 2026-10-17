import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

class UserRepository {
  async existingUser(email) {
    return await prisma.user.findUnique({ where: { email } });
  }
  async findTempUserByEmail(email) {
    return prisma.temp.findUnique({
      where: { email },
    });
  }
  async createVerifiedUser(email) {
    return prisma.user.create({
      data: { email },
    });
  }
  async deleteTempUser(id) {
    return prisma.temp.delete({
      where: { id },
    });
  }
  async findLoginUser(email) {
  return prisma.user.findFirst({
    where: {
      email,
      type: "USER",
      status: "active",
    },
  });
}

// for the forgot password flow
async findByEmail(email) {
  return prisma.user.findUnique({
    where: { email },
  });
}
async findTempByEmail(email) {
  return prisma.temp.findUnique({
    where: { email },
  });
}
async deleteTempByEmail(email) {
  return prisma.temp.delete({
    where: { email },
  });
}
async createTempOTP(data) {
  return prisma.temp.create({
    data,
  });
}
async completeRegistration({ email, name, password }) {
  return prisma.user.update({
    where: { email },
    data: {
      name,
      password,
      status: "active",
    },
  });
}
// end of forgot password flow
async updatePassword({ email, password }) {
  return prisma.user.update({
    where: { email },
    data: { password },
  });
}

async findById(id) {
  return prisma.user.findUnique({
    where: { id },
  });
}

async updateAvatar({ userId, avatar }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      avatar,
    },
  });
}
async updateUserById({ userId, data }) {
  return prisma.user.update({
    where: { id: userId },
    data,
  });
}


async findByIdAndType(id, type) {
  return prisma.user.findFirst({
    where: {
      id,
      type,
    },
  });
}
async updatePasswordById({ userId, password }) {
  return prisma.user.update({
    where: { id: userId },
    data: { password },
  });
}

// An FCM token identifies one physical device, so only one account may hold it.
// Saves the token for this user and takes it away from every other account
// (for example the previous user of a shared phone). Returns the ids of the
// accounts that lost it, so their cached copy can be dropped.
async updateFcmToken(userId, fcm_token) {
  const others = await prisma.user.findMany({
    where: { fcm_token, id: { not: userId } },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { fcm_token, id: { not: userId } },
      data: { fcm_token: null },
    }),
    // only writes this user's row when the token actually differs
    prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ fcm_token: null }, { fcm_token: { not: fcm_token } }],
      },
      data: { fcm_token },
    }),
  ]);

  return others.map((user) => user.id);
}


async findUserByEmailAndId({ email, id, type }) {
  return prisma.user.findFirst({
    where: {
      email,
      id,
      type,
    },
  });
}

async createMail(data) {
  return prisma.mail.create({
    data,
  });
}

async findUserProfileById(userId) {
  const user_data = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      address: true,
      provider: true,
      subscribed_at: true,
      subscription_valid_until: true,
      subscription_status: true,
    },
  });

  if (!user_data) {
    throw new Error("User not found");
  }

  return user_data;
}

}
export default UserRepository;
