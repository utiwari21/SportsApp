import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import path from "path";
import session from "express-session";

// --------------------
// App + Prisma setup
// --------------------
const app = express();
const prisma = new PrismaClient();

// --------------------
// Middleware
// --------------------
app.use(express.json()); // parse JSON requests
app.use(express.urlencoded({ extended: true })); // parse form data
app.use(express.static("public")); // serve static files

// --------------------
// Session config
// --------------------
app.use(
  session({
    name: "sportsapp.sid",
    secret: "dev-secret-change-later",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 // 1 hour
    }
  })
);

// --------------------
// Email transporter
// --------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // use TLS for port 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// --------------------
// Signup route
// --------------------
app.post("/signup", async (req, res) => {
  try {
    let { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.redirect(`/signup.html?error=${encodeURIComponent("All fields required")}`);
    }

    email = email.trim().toLowerCase();

    if (!email.endsWith("@pitt.edu")) {
      return res.redirect(`/signup.html?error=${encodeURIComponent("Only Pitt students allowed")}`);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.redirect(`/login.html?success=${encodeURIComponent("Account already exists. Please log in.")}`);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        isVerified: false,
        verificationToken
      }
    });

    const verificationLink = `http://localhost:3000/verify?token=${verificationToken}`;

    await transporter.sendMail({
      from: `"SportsApp" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify your SportsApp account",
      html: `
        <h2>Welcome to SportsApp!</h2>
        <p>Please verify your email:</p>
        <a href="${verificationLink}">Verify Email</a>
      `
    });

    res.send(`<h2>Signup successful!</h2><p>Please verify your email.</p>`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// --------------------
// Email verification
// --------------------
app.get("/verify", async (req, res) => {
  try {
    const { token } = req.query;

    const user = await prisma.user.findFirst({ where: { verificationToken: token } });
    if (!user) {
      return res.redirect(`/login.html?error=${encodeURIComponent("Invalid or expired token")}`);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationToken: null }
    });

    res.redirect(`/login.html?success=${encodeURIComponent("Email verified successfully!")}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/login.html?error=${encodeURIComponent("Verification failed")}`);
  }
});

// --------------------
// Login
// --------------------
app.get("/login", (req, res) => {
  res.sendFile(path.resolve("public/login.html"));
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isVerified) {
      return res.redirect(`/login.html?error=${encodeURIComponent("Invalid login")}`);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.redirect(`/login.html?error=${encodeURIComponent("Invalid password")}`);
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.redirect(`/login.html?error=${encodeURIComponent("Server error")}`);
  }
});

// --------------------
// Dashboard
// --------------------
app.get("/dashboard", (req, res) => {
  if (!req.session.userId) return res.redirect("/login.html");
  res.sendFile(path.resolve("public/dashboard.html"));
});

// --------------------
// Logged-in user info
// --------------------
app.get("/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  res.json({ username: req.session.username });
});

// --------------------
// Logout
// --------------------
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// --------------------
// Sport selection (session)
// --------------------
app.post("/select-sport", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  req.session.selectedSport = req.body.sport;
  res.json({ success: true });
});

app.get("/selected-sport", (req, res) => {
  res.json({ sport: req.session.selectedSport || null });
});

// --------------------
// Add a new time slot (with duration)
// --------------------
app.post("/add-time", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

    const { sport, location, time, duration } = req.body;
    const userId = req.session.userId;
    const parsedTime = new Date(time);

    if (!sport || !location || !parsedTime || !duration) {
      return res.status(400).json({ error: "All fields required" });
    }

    // Prevent duplicate times
    const exists = await prisma.timeSlot.findFirst({
      where: { userId, sport, location, time: parsedTime }
    });

    if (exists) {
      return res.status(400).json({ error: "Time already exists" });
    }

    // Create time slot with duration
    const newTime = await prisma.timeSlot.create({
      data: {
        sport,
        location,
        time: parsedTime,
        duration,
        user: { connect: { id: userId } }
      }
    });

    res.json(newTime);
  } catch (err) {
    console.error("Add time failed:", err);
    res.status(500).json({ error: "Failed to add time" });
  }
});

// --------------------
// Get all active times for sport + location
// --------------------
app.get("/get-times", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

    const { sport, location } = req.query;

    // Fetch all times
    const times = await prisma.timeSlot.findMany({
      where: { sport, location },
      include: {
        user: { select: { username: true } }
      }
    });

    const now = new Date();

    // Filter out expired times (time + duration < now)
    const activeTimes = times.filter(t => {
      const endTime = new Date(t.time);
      endTime.setMinutes(endTime.getMinutes() + t.duration);
      return endTime > now;
    });

    // Send back username, time, and duration
    res.json({
      times: activeTimes.map(t => ({
        username: t.user.username,
        time: t.time,
        duration: t.duration
      }))
    });
  } catch (err) {
    console.error("Get times failed:", err);
    res.status(500).json({ error: "Failed to fetch times" });
  }
});

// --------------------
// Start server
// --------------------
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
