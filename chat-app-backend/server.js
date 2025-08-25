const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chatapp'
};

let db;

async function initDatabase() {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log('Connected to MySQL database');

    // Create tables
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        username VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Database connection error:', error);
  }
}

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.execute('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [
      username,
      email,
      hashedPassword
    ]);

    const token = jwt.sign({ id: result.insertId, username, email }, process.env.JWT_SECRET || 'your-secret-key');

    res.json({ token, user: { id: result.insertId, username, email } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key'
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/messages', authenticateToken, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM messages ORDER BY created_at ASC LIMIT 100');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/messages', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    const { id, username } = req.user;

    const [result] = await db.execute('INSERT INTO messages (user_id, username, message) VALUES (?, ?, ?)', [
      id,
      username,
      message
    ]);

    const newMessage = {
      id: result.insertId,
      user_id: id,
      username,
      message,
      created_at: new Date()
    };

    // Broadcast to all connected clients
    io.emit('new_message', newMessage);

    res.json(newMessage);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', (userData) => {
    socket.userData = userData;
    console.log(`${userData.username} joined the chat`);
  });

  socket.on('send_message', async (messageData) => {
    try {
      const { user_id, username, message } = messageData;

      const [result] = await db.execute('INSERT INTO messages (user_id, username, message) VALUES (?, ?, ?)', [
        user_id,
        username,
        message
      ]);

      const newMessage = {
        id: result.insertId,
        user_id,
        username,
        message,
        created_at: new Date()
      };

      io.emit('receive_message', newMessage);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('disconnect', () => {
    if (socket.userData) {
      console.log(`${socket.userData.username} disconnected`);
    }
  });
});

const PORT = process.env.PORT || 5000;

initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
