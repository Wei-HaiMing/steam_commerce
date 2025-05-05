import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fetch from "node-fetch";
import seedrandom from "seedrandom";

const app = express();
dotenv.config();

app.set("view engine", "ejs");
app.use(express.static("public"));

//for Express to get values using POST method
app.use(express.urlencoded({ extended: true }));

//setting up database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
});
const conn = await pool.getConnection();

//routes
app.get("/", async (_, res) => {
  try {
    const response = await fetch(
      `https://api.steampowered.com/ISteamApps/GetAppList/v1?key=${process.env.STEAM_API_KEY}`
    );
    const data = await response.json();
    const apps = data["applist"]["apps"]["app"];
    const rng = seedrandom("150");

    const randomApps = [];
    const appCount = Math.min(150, apps.length); // Ensure we don't exceed the number of apps available
    const usedIndices = new Set();

    while (randomApps.length < appCount) {
      const randomIndex = Math.floor(rng() * apps.length);
      if (!usedIndices.has(randomIndex)) {
        randomApps.push(apps[randomIndex]);
        usedIndices.add(randomIndex);
      }
    }

    // Fetch app details concurrently
    const fullInfo = await Promise.all(
      randomApps.map(async (app) => {
        try {
          const url = `https://store.steampowered.com/api/appdetails?appids=${app["appid"]}`;
          const response = await fetch(url);
          return await response.json();
        } catch (error) {
          console.error(
            `Failed to fetch details for app ID ${app["appid"]}:`,
            error
          );
          return null; // Return null for failed requests
        }
      })
    );

    // Filter out null responses
    res.send(fullInfo.filter((info) => info !== null));
  } catch (error) {
    console.error("Error fetching app list:", error);
    res.status(500).send("An error occurred while fetching app data.");
  }
});


//Search Route
app.get("/search", async (req, res) => {
  const query = req.query.q;
  let sql = "SELECT * FROM game";
  let sqlParams = [];

  if (query) {
    sql += " WHERE name LIKE ?";
    sqlParams.push(`%${query}%`);
  }

  try {
    const [rows] = await conn.query(sql, sqlParams);
    res.render("search", { rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});


app.get("/api/getLists/:userId", async (req, res) => {
  let userId = req.params.userId;
  let sql = `SELECT * FROM wishlist WHERE userId = ?`;
  let sqlParams = [userId];
  const[rows] = await conn.query(sql, sqlParams);
  res.send(rows);
});





app.listen(3000, () => {
  console.log("Express server running");
});
