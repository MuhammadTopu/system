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

async updateFcmToken(userId, fcm_token) {
  return prisma.user.update({
    where: { id: userId },
    data: { fcm_token },
  });
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
    },
  });

  if (!user_data) {
    throw new Error("User not found");
  }

  return user_data;
}

// check subs
async findSubscriptionByUserId(userId) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      user_id: userId,
    },
  });
  return subscription;
}
}
export default UserRepository;
