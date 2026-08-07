import firebaseService from "./firebase.service.js";

export const testPush = async (req, res, next) => {
  try {
    const { token, title, body } = req.body;
    if (!token) {
      return res.status(400).json({ message: "token is required" });
    }

    const result = await firebaseService.sendToken(token, {
      title: title || "Test notification",
      body: body || "This is a test push from Maintenance Genie",
    });

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    next(error);
  }
};
