const express = require("express");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const fs = require("fs");
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
const ensureFileExists = () => {
  if (!fs.existsSync(portfolioFilePath)) {
    // Create the file with initial empty data if it doesn't exist
    const initialData = {};
    fs.writeFileSync(portfolioFilePath, JSON.stringify(initialData, null, 2));
    console.log("portfolio.json file created.");
  } else {
    // If file exists but is empty, initialize it with an empty object
    const fileContent = fs.readFileSync(portfolioFilePath, "utf8");
    if (!fileContent) {
      fs.writeFileSync(portfolioFilePath, JSON.stringify({}, null, 2));
      console.log("portfolio.json was empty, initialized with empty data.");
    }
  }
};

// Ensure the file exists when starting the app
ensureFileExists();

app.get("/", (req, res) => {
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

  // Ensure the portfolio file exists before reading it
  ensureFileExists();

  // Read the portfolio content from the JSON file
  fs.readFile(portfolioFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading portfolio data file:", err);
      return res.status(500).send("Error loading portfolio");
    }

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

    res.render("index", { isAuthenticated, user, portfolioData });
  });
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
app.post("/edit", (req, res) => {
  const token = req.cookies.jwt;
  if (!token) return res.status(403).send("Unauthorized");

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`Updated by: ${user.displayName}`);

    // Get the new data from the request body (about me, projects, github contributions)
    const { aboutMe, projects, githubContributions } = req.body;

    // Ensure the portfolio file exists
    ensureFileExists();

    // Read the existing portfolio data from the file
    fs.readFile(portfolioFilePath, "utf8", (err, data) => {
      if (err) {
        console.error("Error reading portfolio data file:", err);
        return res.status(500).send("Error updating portfolio");
      }

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
      fs.writeFile(
        portfolioFilePath,
        JSON.stringify(portfolioData, null, 2),
        (err) => {
          if (err) {
            console.error("Error writing to portfolio data file:", err);
            return res.status(500).send("Error saving portfolio changes");
          }

          console.log("Portfolio updated successfully");
          res.redirect("/");
        }
      );
    });
  } catch (err) {
    res.status(403).send("Unauthorized");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
