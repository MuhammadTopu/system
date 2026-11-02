import jwt from "jsonwebtoken";

// The refresh token is signed with its own secret, so it can never be accepted
// where an access token (JWT_SECRET) is expected, and the other way round.
const refreshSecret = () =>
  process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}:refresh`;

export const signAccessToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      type: user.type,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "100d" },
  );

export const signRefreshToken = (user) =>
  jwt.sign({ userId: user.id }, refreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "180d",
  });

// Throws if the token is invalid or expired.
export const verifyRefreshToken = (token) => jwt.verify(token, refreshSecret());
