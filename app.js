const express = require("express");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const fs = require("fs").promises;
const path = require("path");
require("dotenv").config();

const app = express();

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set("view engine", "ejs");
app.set("views", "views");

app.use(
  session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false
  })
);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.G_CLIENT_ID,
      clientSecret: process.env.G_CLIENT_SECRET,
      callbackURL: process.env.G_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      const user = {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.emails[0].value,
      };
      done(null, user);
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());

// Define the path for portfolio.json
const portfolioFilePath = path.join(__dirname, "portfolio.json");

// Ensure the portfolio file exists, create it if it doesn't, and initialize if empty
const ensureFileExists = async () => {
  try {
    // Try to read the file
    const stats = await fs.stat(portfolioFilePath).catch(() => null);

    // If file doesn't exist, create it
    if (!stats) {
      await fs.writeFile(portfolioFilePath, JSON.stringify({}, null, 2));
      console.log("portfolio.json file created.");
      return;
    }

    // If file exists but is empty, initialize with empty object
    const fileContent = await fs.readFile(portfolioFilePath, "utf8");
    if (!fileContent.trim()) {
      await fs.writeFile(portfolioFilePath, JSON.stringify({}, null, 2));
      console.log("portfolio.json was empty, initialized with empty data.");
    }
  } catch (err) {
    console.error("Error ensuring file exists:", err);
  }
};

app.get("/", async (req, res) => {
  const token = req.cookies.jwt;
  let user = null;
  let isAuthenticated = false;

  if (token) {
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
      isAuthenticated = true;
    } catch (err) {
      res.clearCookie("jwt");
    }
  }

  try {
    // Ensure the portfolio file exists
    await ensureFileExists();

    // Read the portfolio content from the JSON file
    const data = await fs.readFile(portfolioFilePath, "utf8");
    let portfolioData = {};

    // If the file is not empty, parse the data
    if (data) {
      try {
        portfolioData = JSON.parse(data);
      } catch (e) {
        console.error("Error parsing portfolio data:", e);
        return res.status(500).send("Error parsing portfolio data");
      }
    }

    // Log for debugging
    console.log("User:", user);
    console.log("portfolioData:", portfolioData);

    res.render("index", { 
      isAuthenticated, 
      user, 
      portfolioData, 
      userPortfolio: user ? portfolioData[user.id] : null 
    });
  } catch (err) {
    console.error("Error reading portfolio data file:", err);
    return res.status(500).send("Error loading portfolio");
  }
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign(req.user, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });
    res.cookie("jwt", token, { httpOnly: true });
    res.redirect("/");
  }
);

app.get("/logout", (req, res) => {
  // Clear the JWT cookie
  res.clearCookie("jwt");

  // If you're using passport.js for session management, call req.logout
  req.logout((err) => {
    if (err) {
      return res.status(500).send("Error logging out");
    }
    // Redirect to the home page after successful logout
    res.redirect("/");
  });
});

// Editing route
app.post("/edit", async (req, res) => {
  const token = req.cookies.jwt;
  if (!token) return res.status(403).send("Unauthorized");

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`Updated by: ${user.displayName}`);

    // Get the new data from the request body (about me, projects, github contributions)
    const { aboutMe, projects, githubContributions } = req.body;

    // Ensure the portfolio file exists
    await ensureFileExists();

    // Read the existing portfolio data from the file
    const data = await fs.readFile(portfolioFilePath, "utf8");

    // Parse the existing portfolio data
    let portfolioData = {};

    // If the file is not empty, parse the data
    if (data) {
      try {
        portfolioData = JSON.parse(data);
      } catch (e) {
        console.error("Error parsing portfolio data:", e);
        return res.status(500).send("Error parsing portfolio data");
      }
    }

    // Create or update the portfolio structure for the logged-in user
    portfolioData[user.id] = {
      user: user.displayName,
      aboutMe: aboutMe || "",
      projects: projects || "",
      githubContributions: githubContributions || "",
    };

    // Write the updated portfolio data back to the file
    await fs.writeFile(
      portfolioFilePath,
      JSON.stringify(portfolioData, null, 2)
    );

    console.log("Portfolio updated successfully");
    res.redirect("/");
  } catch (err) {
    console.error("Error in edit route:", err);
    res.status(403).send("Unauthorized");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    // Ensure file exists when starting the app
    await ensureFileExists();
    console.log(`Server is running on http://localhost:${PORT}`);
  } catch (err) {
    console.error("Error starting server:", err);
  }
});