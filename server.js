const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const port = 4000;

// Function to log messages with a timestamp
function logWithTimestamp(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

const corsOptions = {
  origin: process.env.ORIGIN_URL, // Allow requests only from this origin
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Specify allowed methods
  credentials: true, // Allow credentials (if needed)
};

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "story_db",
  waitForConnections: true,
  connectionLimit: 10, // Set your preferred connection limit
  queueLimit: 0,
});
logWithTimestamp("Connection pool created");

// Multer setup for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads");
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Utility function to execute a query
const executeQuery = (query, params) => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) return reject(err);
      connection.query(query, params, (err, results) => {
        connection.release();
        if (err) return reject(err);
        resolve(results);
      });
    });
  });
};

// API to save a new story with optional buyImage and buyLink
app.post("/api/stories", authenticateToken, async (req, res) => {
  const {
    title,
    content,
    buyImage = null,
    buyLink = null,
    authorFirstName,
    authorLastName,
  } = req.body;
  const submittedBy = req.user.id; // Get the current user's ID
  const submittedOn = new Date(); // Current date and time

  if (!title || !content || !authorFirstName || !authorLastName) {
    return res.status(400).json({
      message:
        "Title, content, authorFirstName, and authorLastName are required",
    });
  }

  const query =
    "INSERT INTO stories (title, content, buyImage, buyLink, submittedBy, submittedOn, authorFirstName, authorLastName) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

  try {
    const result = await executeQuery(query, [
      title,
      content,
      buyImage,
      buyLink,
      submittedBy,
      submittedOn,
      authorFirstName,
      authorLastName,
    ]);
    res.status(201).json({
      id: result.insertId,
      title,
      content,
      buyImage,
      buyLink,
      submittedBy,
      submittedOn,
      authorFirstName,
      authorLastName,
    });
    logWithTimestamp(
      `Story created: ${title} by ${authorFirstName} ${authorLastName}`
    );
  } catch (err) {
    logWithTimestamp(`Error saving story: ${err}`);
    res.status(500).json({ message: "Internal server error." });
  }
});

// API to get all stories
app.get("/api/stories", async (req, res) => {
  const query = "SELECT * FROM stories WHERE published = TRUE"; //get all published stories
  try {
    const results = await executeQuery(query);
    res.json(results);
    logWithTimestamp("Fetched all stories");
  } catch (err) {
    logWithTimestamp(`Error fetching stories: ${err}`);
    res.status(500).json({ message: "Internal server error." });
  }
});

// API to update an existing story
app.put("/api/stories/:id", async (req, res) => {
  const { id } = req.params;
  const { title, content, buyImage, buyLink } = req.body;

  const query =
    "UPDATE stories SET title = ?, content = ?, buyImage = ?, buyLink = ? WHERE id = ?";
  try {
    await executeQuery(query, [title, content, buyImage, buyLink, id]);
    res.json({ id, title, content, buyImage, buyLink });
    logWithTimestamp(`Story updated: ${title} with ID ${id}`);
  } catch (err) {
    logWithTimestamp(`Error updating story: ${err}`);
    res.status(500).json({ message: "Internal server error." });
  }
});

// Image upload API
app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${
    req.file.filename
  }`;
  res.status(200).json({ imagePath: imageUrl });
  logWithTimestamp(`Image uploaded: ${imageUrl}`);
});

// API to publish a story from My Account
app.put("/api/stories/publish/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { publishedOn } = req.body;

  if (!publishedOn || isNaN(new Date(publishedOn))) {
    return res.status(400).json({ message: "Invalid published date." });
  }

  const query = `
    UPDATE stories 
    SET published = TRUE, publishedOn = ? 
    WHERE id = ? AND submittedBy = ?
  `;

  try {
    await executeQuery(query, [new Date(publishedOn), id, req.user.id]);
    res.json({ message: "Story published successfully!" });
    logWithTimestamp(`Story published: ID ${id} by user ${req.user.id}`);
  } catch (err) {
    logWithTimestamp(`Error publishing story ID ${id}: ${err}`);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// Get a specific story by ID
app.get("/api/stories/:id", async (req, res) => {
  const { id } = req.params;
  const query = "SELECT * FROM stories WHERE id = ?";
  try {
    const results = await executeQuery(query, [id]);
    if (results.length === 0) {
      logWithTimestamp(`Story not found: ID ${id}`);
      return res.status(404).json({ message: "Story not found" });
    }
    res.json(results[0]);
    logWithTimestamp(`Fetched story ID ${id}`);
  } catch (err) {
    logWithTimestamp(`Error fetching story ID ${id}: ${err}`);
    return res.status(500).json({ error: err.message });
  }
});

// User Registration
app.post("/api/register", async (req, res) => {
  const { username, firstname, lastname, email, password, country } = req.body;

  if (!username || !firstname || !lastname || !email || !password || !country) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query =
      "INSERT INTO users (username, firstname, lastname, email, password, country) VALUES (?, ?, ?, ?, ?, ?)";

    const result = await executeQuery(query, [
      username,
      firstname,
      lastname,
      email,
      hashedPassword,
      country,
    ]);
    res.status(201).json({
      message: "Registration successful!",
      user: {
        id: result.insertId,
        username,
        firstname,
        lastname,
        email,
        country,
      },
    });
    logWithTimestamp(`User registered: ${username}`);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Username or email already exists." });
    }
    logWithTimestamp(`Error during registration: ${err}`);
    res.status(500).json({ message: "Internal server error." });
  }
});

// User Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required." });
  }

  const query = "SELECT * FROM users WHERE username = ?";
  try {
    const results = await executeQuery(query, [username]);
    const user = results[0];
    if (!user) {
      logWithTimestamp(`Invalid login attempt for username: ${username}`);
      return res.status(401).json({ message: "Invalid username or password." });
    }

    if (user.isLocked) {
      return res
        .status(403)
        .json({ message: "Account is locked. Please try again later." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const failedAttempts = user.failedAttempts + 1;

      if (failedAttempts >= 5) {
        await executeQuery(
          "UPDATE users SET isLocked = ?, failedAttempts = ? WHERE username = ?",
          [true, failedAttempts, username]
        );
        logWithTimestamp(`Account locked for username: ${username}`);
        return res.status(403).json({
          message: "Account is locked due to too many failed login attempts.",
        });
      } else {
        await executeQuery(
          "UPDATE users SET failedAttempts = ? WHERE username = ?",
          [failedAttempts, username]
        );
      }

      logWithTimestamp(`Invalid password for username: ${username}`);
      return res.status(401).json({ message: "Invalid username or password." });
    }

    await executeQuery(
      "UPDATE users SET failedAttempts = ?, isLocked = ? WHERE username = ?",
      [0, false, username]
    );

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    logWithTimestamp("JWT Token generated for user: " + username);
    res.json({ message: "Login successful!", token });
  } catch (err) {
    logWithTimestamp(`Error during login: ${err}`);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// API to get the user's drafts and published stories
app.get("/api/my-stories", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const query = "SELECT * FROM stories WHERE submittedBy = ?";
  try {
    const results = await executeQuery(query, [userId]);
    const drafts = results.filter((story) => !story.published);
    const published = results.filter((story) => story.published);

    res.json({ drafts, published });
    logWithTimestamp(`Fetched stories for user ID ${userId}`);
  } catch (err) {
    logWithTimestamp(`Error fetching stories for user ID ${userId}: ${err}`);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// Example of a protected route
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({ message: "This is a protected route.", user: req.user });
});

// API to handle password reset request
app.post("/api/reset-password", async (req, res) => {
  const { email } = req.body;
  logWithTimestamp("Password reset request received for email: " + email);

  const query = "SELECT * FROM users WHERE email = ?";
  try {
    const results = await executeQuery(query, [email]);
    if (results.length === 0) {
      logWithTimestamp("Email not found: " + email);
      return res.status(400).json({ message: "Email not found." });
    }

    const user = results[0];
    const token = crypto.randomBytes(20).toString("hex");
    const tokenExpiry = new Date(Date.now() + 3600000);

    const updateQuery =
      "UPDATE users SET passwordResetToken = ?, tokenExpiry = ? WHERE email = ?";
    await executeQuery(updateQuery, [token, tokenExpiry, email]);
    logWithTimestamp(`Token expiry set to: ${tokenExpiry}`);

    const resetLink = `${process.env.API_URL}/reset-password?token=${token}`;
    logWithTimestamp("Reset link generated: " + resetLink);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      text: `You requested a password reset. Click the link to reset your password: ${resetLink}`,
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        logWithTimestamp("Email sending error: " + error);
        return res.status(500).json({ message: "Failed to send email." });
      }
      logWithTimestamp("Reset link sent to email: " + email);
      res.status(200).json({ message: "Reset link sent to your email." });
    });
  } catch (err) {
    logWithTimestamp("Database query error: " + err);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// Serve the reset password page
app.get("/reset-password", (req, res) => {
  const token = req.query.token;
  logWithTimestamp("Token received in GET /reset-password: " + token);

  if (!token) {
    logWithTimestamp("No token provided in request.");
    return res.status(400).send("Invalid token.");
  }

  res.sendFile(path.join(__dirname, "public", "reset-password.html"));
});

// API to handle password reset
app.post("/api/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  logWithTimestamp("Token received in POST /api/reset-password: " + token);
  logWithTimestamp("New password received for reset: " + newPassword);

  const currentTime = new Date();
  logWithTimestamp("Current time for token validation: " + currentTime);

  const query =
    "SELECT * FROM users WHERE passwordResetToken = ? AND tokenExpiry > ?";
  try {
    const results = await executeQuery(query, [token, currentTime]);

    logWithTimestamp(
      `Results from token validation query: ${JSON.stringify(results)}`
    );

    if (results.length === 0) {
      logWithTimestamp("Invalid or expired token: " + token);
      return res.status(400).json({ message: "Invalid or expired token." });
    }

    const user = results[0];
    logWithTimestamp("Valid token found for user ID: " + user.id);

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    logWithTimestamp("New hashed password generated for user ID: " + user.id);

    const updateQuery =
      "UPDATE users SET password = ?, passwordResetToken = NULL, tokenExpiry = NULL WHERE id = ?";
    await executeQuery(updateQuery, [hashedPassword, user.id]);

    logWithTimestamp("Password updated successfully for user ID: " + user.id);
    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (err) {
    logWithTimestamp("Failed to reset password for user: " + err.message);
    return res.status(500).json({ message: "Failed to reset password." });
  }
});

// API to get the current user data
app.get("/api/user/me", authenticateToken, async (req, res) => {
  const userId = req.user.id; // Get user ID from JWT
  const query = "SELECT * FROM users WHERE id = ?";
  logWithTimestamp(`Fetching user data for user ID: ${userId}`);

  try {
    const userResults = await executeQuery(query, [userId]);

    if (userResults.length === 0) {
      logWithTimestamp(`No user found with ID: ${userId}`);
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResults[0];
    logWithTimestamp(`User found: ${JSON.stringify(user)}`);

    // Count published stories
    const publishedCountQuery =
      "SELECT COUNT(*) as count FROM stories WHERE submittedBy = ? AND published = TRUE";
    const [publishedCountRows] = await executeQuery(publishedCountQuery, [
      userId,
    ]);
    const publishedCount = publishedCountRows.count;
    logWithTimestamp(
      `Published stories count for user ID ${userId}: ${publishedCount}`
    );

    // Count drafts
    const draftCountQuery =
      "SELECT COUNT(*) as count FROM stories WHERE submittedBy = ? AND published = FALSE";
    const [draftCountRows] = await executeQuery(draftCountQuery, [userId]);
    const draftCount = draftCountRows.count;
    logWithTimestamp(`Drafts count for user ID ${userId}: ${draftCount}`);

    return res.json({
      username: user.username,
      firstname: user.firstname,
      lastname: user.lastname,
      publishedCount, // Count of published stories
      draftCount, // Count of drafts
    });
  } catch (error) {
    logWithTimestamp("Error fetching user data: " + error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running at https://0.0.0.0:${port}`);
});
// // Start the server
// app.listen(port, () => {
//   logWithTimestamp(`Server is running at http://localhost:${port}`);
// });
