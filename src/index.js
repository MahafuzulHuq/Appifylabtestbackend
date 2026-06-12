require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');
const likeRoutes = require('./routes/likes');
const healthRoute = require('./routes/health')

const app = express();
const PORT = process.env.PORT || 5000;
 
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

var uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
console.log("Serving uploads from:", uploadDir);
app.use('/api/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')));  

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/likes', likeRoutes);

app.use('/api/health', healthRoute);

app.use((err, _req, res, _next) => {  
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`✅  BuddyScript API running on http://localhost:${PORT}`);
});
