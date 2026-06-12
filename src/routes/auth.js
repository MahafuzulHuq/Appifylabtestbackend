const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { body, validationResult } = require("express-validator");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");
const { upload } = require("../middleware/upload"); 

const router = express.Router();
const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
  });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || "7d",
  });
  return { accessToken, refreshToken };
};

const setCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

router.post( "/register", [
    body("firstName").trim().notEmpty().withMessage("First name is required"),
    body("lastName").trim().notEmpty().withMessage("Last name is required"),
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { firstName, lastName, email, password } = req.body;

    try {
      const existing = await prisma.user.findUnique({ where: { email } });       
      if (existing)
        return res.status(409).json({ error: "Email already registered" });
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          passwordHash,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      const { accessToken, refreshToken } = generateTokens(user.id);
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      setCookies(res, accessToken, refreshToken);

      return res
        .status(201)
        .json({ message: "Account created successfully", user });
    } catch (err) {       
      return res
        .status(500)
        .json({ error: "Server error during registration" });
    }
  },
);

router.post(  "/login",
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user)
        return res
          .status(401)
          .json({ error: "Invalid email or password for user" });  
      const valid = await bcrypt.compare(password, user.passwordHash); 
      if (!valid)
        return res.status(401).json({ error: "Invalid email or password" });

      const { accessToken, refreshToken } = generateTokens(user.id);

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      setCookies(res, accessToken, refreshToken);

      return res.json({
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
      });
    } catch (err) {      
      return res.status(500).json({ error: "Server error during login" });
    }
  },
);

router.post("/logout", authenticate, async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    return res.json({ message: "Logged out successfully" });
  } catch (err) {    
    return res.status(500).json({ error: "Server error during logout" });
  }
});

router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: "No refresh token" });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (!stored || stored.expiresAt < new Date()) {
      return res
        .status(401)
        .json({ error: "Refresh token expired or invalid" });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      payload.userId,
    );

    await prisma.refreshToken.update({
      where: { token: refreshToken },
      data: {
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    setCookies(res, accessToken, newRefreshToken);
    return res.json({ message: "Token refreshed" });
  } catch {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/update", authenticate, upload.single("image"), async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: "No refresh token" });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (!stored || stored.expiresAt < new Date()) {
      return res
        .status(401)
        .json({ error: "Refresh token expired or invalid" });
    }

    const avatarUrl = req.file ? `/api/uploads/${req.file.filename}` : null; 
    await prisma.user.update({
      where: { id: payload.userId },
      data: { avatarUrl: avatarUrl },
    }); 
    return res.json({ message: "Avatar updated" });
  } catch { 
    return res.status(401).json({ error: "Invalid avatar image" });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {   
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
