const express = require("express");
const { body, validationResult } = require("express-validator");
const { PrismaClient } = require("@prisma/client");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

const formatComment = (c) => ({
  ...c,
  likedByMe: c.likes.length > 0,
  likeCount: c._count.likes,
  likes: undefined,
  _count: undefined,
  replies: c.replies ? c.replies.map(formatComment) : undefined,
});

router.get("/:postId", authenticate, async (req, res) => {
  const currentUserId = req.user.userId;
  try {
    const comments = await prisma.comment.findMany({
      where: { postId: req.params.postId, parentId: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        _count: { select: { likes: true } },
        likes: { where: { userId: currentUserId }, select: { id: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            createdAt: true,
            parentId: true,
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
            _count: { select: { likes: true } },
            likes: { where: { userId: currentUserId }, select: { id: true } },
          },
        },
      },
    });
    return res.json({ comments: comments.map(formatComment) });
  } catch (err) {    
    return res.status(500).json({ error: "Error fetching comments" });
  }
});

router.post( "/:postId", authenticate,
  [
    body("content").trim().isLength({ min: 1, max: 2000 }).withMessage("Comment content required"), 
    body("parentId").optional({ checkFalsy: true }).isString().withMessage("Invalid parentId")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    try {
      const { content, parentId } = req.body;
      const postId = req.params.postId;     

      const post = await prisma.post.findUnique({ where: { id: postId } });
      if (!post) return res.status(404).json({ error: "Post not found" });
      if (post.visibility === "private" && post.authorId !== req.user.userId) {
        return res.status(403).json({ error: "Cannot comment on private post" });
      }
       
      const comment = await prisma.comment.create({
        data: {
          postId,
          authorId: req.user.userId,
          content,
          parentId: parentId || null,
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          parentId: true,
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      });

      return res.status(201).json({ ...comment, likedByMe: false, likeCount: 0, replies: [] });
    } catch (err) {     
      return res.status(500).json({ error: "Error creating comment" });
    }
  },
);

router.post("/like/:commentId", authenticate, async (req, res) => {
  const userId = req.user.userId;
  const commentId = req.params.commentId;
  try {
    const existing = await prisma.like.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });

    if (existing) {
      await prisma.like.delete({
        where: { userId_commentId: { userId, commentId } },
      });
      const count = await prisma.like.count({ where: { commentId } });
      return res.json({ liked: false, likeCount: count });
    } else {
      await prisma.like.create({ data: { userId, commentId } });
      const count = await prisma.like.count({ where: { commentId } });
      return res.json({ liked: true, likeCount: count });
    }
  } catch (err) { 
    return res.status(500).json({ error: "Error toggling comment like" });
  }
});

router.get("/likes/:commentId", authenticate, async (req, res) => {
  try {
    const likes = await prisma.like.findMany({
      where: { commentId: req.params.commentId },
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
      take: 100,
    });
    return res.json({ likes: likes.map((l) => l.user) });
  } catch (err) {
    return res.status(500).json({ error: "Error fetching likes" });
  }
});

module.exports = router;
