const express = require("express");
const { body, validationResult } = require("express-validator");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");
const { upload } = require("../middleware/upload"); 

const router = express.Router();
const prisma = new PrismaClient();
const PAGE_SIZE = 10;

const postSelect = (currentUserId) => ({
  id: true,
  content: true,
  imageUrl: true,
  visibility: true,
  createdAt: true,
  author: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
  _count: { select: { likes: true, comments: true } },
  likes: { where: { userId: currentUserId }, select: { id: true } },
});

const formatPost = (p) => ({
  ...p,
  likedByMe: p.likes.length > 0,
  likeCount: p._count.likes,
  commentCount: p._count.comments,
  likes: undefined,
  _count: undefined,
});
  
router.get("/", authenticate, async (req, res) => {
  try {
    const { cursor } = req.query;
    const userId = req.user.userId;

    const where = {
      OR: [
        { visibility: "public" },
        { authorId: userId, visibility: "private" },
      ],
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    };

    const posts = await prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: postSelect(userId),
    });

    const nextCursor =
      posts.length === PAGE_SIZE
        ? posts[posts.length - 1].createdAt.toISOString()
        : null;

    return res.json({ posts: posts.map(formatPost), nextCursor });
  } catch (err) {     
    return res.status(500).json({ error: "Error fetching posts" });
  }
});

router.post( "/", authenticate, upload.single("image"),
  [
    body("content")
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage("Content required (max 5000 chars)"),
    body("visibility")
      .optional()
      .isIn(["public", "private"])
      .withMessage("visibility must be public or private"),
    body("imageUrl"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    try {
      const { content, visibility = "public" } = req.body;
      const imageUrl = req.file ? `/api/uploads/${req.file.filename}` : null;
 
      const post = await prisma.post.create({
        data: { authorId: req.user.userId, content, imageUrl, visibility },
        select: postSelect(req.user.userId),
      });

      return res.status(201).json(formatPost(post));
    } catch (err) {      
      return res.status(500).json({ error: "Error creating post" });
    }
  },
);

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (post.authorId !== req.user.userId)
      return res.status(403).json({ error: "Forbidden" });

    await prisma.post.delete({ where: { id: req.params.id } });
    return res.json({ message: "Post deleted" });
  } catch (err) {    
    return res.status(500).json({ error: "Error deleting post" });
  }
});

router.post("/:id/like", authenticate, async (req, res) => {
  const userId = req.user.userId;
  const postId = req.params.id;
  try {
    const existing = await prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      await prisma.like.delete({
        where: { userId_postId: { userId, postId } },
      });
      const count = await prisma.like.count({ where: { postId } });
      return res.json({ liked: false, likeCount: count });
    } else {
      await prisma.like.create({ data: { userId, postId } });
      const count = await prisma.like.count({ where: { postId } });
      return res.json({ liked: true, likeCount: count });
    }
  } catch (err) {    
    return res.status(500).json({ error: "Error toggling like" });
  }
});

router.get("/:id/likes", authenticate, async (req, res) => {
  try {
    const likes = await prisma.like.findMany({
      where: { postId: req.params.id },
      select: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json({ likes: likes.map((l) => l.user) });
  } catch (err) {
    return res.status(500).json({ error: "Error fetching likes" });
  }
});

router.get("/:id/comments", authenticate, async (req, res) => {
  try {
    const count = await prisma.comment.count({
      where: { postId: req.params.id },
    });
    return res.json({ count });
  } catch (err) {
    return res.status(500).json({ error: "Error fetching comments" });
  }
});

module.exports = router;
