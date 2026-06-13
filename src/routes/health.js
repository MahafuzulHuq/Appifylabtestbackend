const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

router.get("/", async (req, res) => {
  try {
    const [dbTimeResult, totalUsers, totalPosts] = await Promise.all([
      prisma.$queryRaw`SELECT * FROM User`,
      prisma.user.count(),
      prisma.post.count(),
    ]);
    return res.status(200).json({
      status: "ok",
      message: "Server is running",
      database: "connected",
      timestamp: new Date().toISOString(),
      dbTime: dbTimeResult[0] || null,
      metrics: {
        totalUsers: totalUsers,
        totalPosts: totalPosts,
        combinedRecords: totalUsers + totalPosts,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Health check failed operational testing",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
