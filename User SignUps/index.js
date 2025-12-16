import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

import nodemailer from "nodemailer";
import path from "path";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});


const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

//------------
// Sessions
//------------
import session from "express-session";
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
    return res.redirect(
        `/login.html?success=${encodeURIComponent(
        "Account already exists. Please log in."
        )}`
    );
}


    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        isVerified: false,
        verificationToken,
      },
    });

    console.log(`Signup successful for ${email}`);


    const verificationLink = `http://localhost:3000/verify?token=${verificationToken}`;

    await transporter.sendMail({
    from: `"SportsApp" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verify your SportsApp account",
    html: `
        <h2>Welcome to SportsApp!</h2>
        <p>Please verify your email by clicking the link below:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>If you did not sign up, you can ignore this email.</p>
    `,
    });

    res.send(`
        <h2>Signup successful!</h2>
        <p>A verification email has been sent to your Pitt email.</p>
        <p>Please verify before logging in.</p>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// --------------------
// Verification route
// --------------------
app.get("/verify", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) return res.redirect(`/login.html?error=${encodeURIComponent("Invalid verification link")}`);

    const user = await prisma.user.findFirst({ where: { verificationToken: token } });
    if (!user) return res.redirect(`/login.html?error=${encodeURIComponent("Invalid or expired verification token")}`);

    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationToken: null },
    });

    // res.send("Email verified successfully! You can now log in.");
    res.redirect(`/login.html?success=${encodeURIComponent("Email verified successfully! You can now log in.")}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/login.html?error=${encodeURIComponent("Server error during verification")}`);
  }
});

// --------------------
// Login routes
// --------------------
app.get("/login", (req, res) => {
  res.sendFile(path.resolve("public/login.html"));
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.redirect(`/login.html?error=${encodeURIComponent("All fields required")}`);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.redirect(`/login.html?error=${encodeURIComponent("User not found")}`);
    if (!user.isVerified) return res.redirect(`/login.html?error=${encodeURIComponent("Please verify your email first")}`);

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.redirect(`/login.html?error=${encodeURIComponent("Incorrect password")}`);
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.redirect("/dashboard");


  } catch (err) {
    console.error(err);
    res.redirect(`/login.html?error=${encodeURIComponent("Server error")}`);
  }
});

app.get("/dashboard", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login.html?error=Please log in");
  }

  res.sendFile(path.resolve("public/dashboard.html"));
});

//fetching from dashboard.html
app.get("/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  res.json({
    username: req.session.username
  });
});

//logout route
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});



// --------------------
// Start server
// --------------------
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
