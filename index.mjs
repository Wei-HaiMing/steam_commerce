import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fetch from "node-fetch";
import seedrandom from "seedrandom";

const app = express();
dotenv.config();

app.set("view engine", "ejs");
app.use(express.static("public"));

// For Express to get values using POST method
app.use(express.urlencoded({ extended: true }));

// Setting up database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
});

// Function to fetch and insert 150 games into the database
async function loadGamesIntoDatabase() {
  try {
    const response = await fetch(
      `https://api.steampowered.com/ISteamApps/GetAppList/v1?key=${process.env.STEAM_API_KEY}`
    );
    const data = await response.json();
    const apps = data["applist"]["apps"]["app"];
    const rng = seedrandom("160");

    const randomApps = [];
    const appCount = Math.min(200, apps.length);
    const usedIndices = new Set();

    while (randomApps.length < appCount) {
      const randomIndex = Math.floor(rng() * apps.length);
      if (!usedIndices.has(randomIndex)) {
        randomApps.push(apps[randomIndex]);
        usedIndices.add(randomIndex);
      }
    }

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const fullInfo = [];
    for (const app of randomApps) {
      const url = `https://store.steampowered.com/api/appdetails?appids=${app["appid"]}`;
      let retries = 3;

      while (retries > 0) {
        try {
          console.log(`Fetching details for app ID: ${app["appid"]}`);
          const response = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
          });
          if (!response.ok) {
            if (response.status === 429 || response.status === 403) {
              console.warn(`Rate-limited. Retrying after delay...`);
              await delay(500);
              retries -= 1;
              continue;
            }
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const appDetails = await response.json();
          const appData = appDetails[app["appid"]]?.data || null;

          if (
            appData &&
            appData.name &&
            appData.name.trim() !== "" &&
            (!appData.genres ||
              !appData.genres.some(
                (genre) => genre.description.toLowerCase() === "dlc"
              ))
          ) {
            fullInfo.push(appData);
          }
          break;
        } catch (error) {
          console.error(
            `Error fetching details for app ID ${app["appid"]}:`,
            error
          );
          retries -= 1;
          if (retries === 0) {
            console.error(
              `Failed to fetch details for app ID ${app["appid"]} after 3 retries.`
            );
          }
        }
      }

      // Add a delay between requests to avoid rate-limiting
      await delay(500);
    }

    const validApps = fullInfo.slice(0, 150); // Ensure only 150 valid apps
    console.log(`Valid apps fetched: ${validApps.length}`);

    // Insert valid apps into the database
    const conn = await pool.getConnection();
    try {
      for (const app of validApps) {
        const {
          steam_appid,
          name = "Unknown Name",
          short_description = "No description available",
          genres = [],
          header_image = "No image available",
          price_overview = {},
          release_date = {},
        } = app;

        // Ensure genre is not null
        const genre = genres?.[0]?.description || "Unknown";

        // Ensure price is not null
        const price = price_overview?.final_formatted || "Free";

        // Ensure release date is not null
        // Ensure release date is not null
        const releaseDate = release_date?.date || "0000-00-00";

        // Format the release date if it's not "Unknown" and has the expected format
        let formattedDate = releaseDate;
        if (
          releaseDate !== "0000-00-00" &&
          releaseDate.split(" ").length === 3
        ) {
          const dateParts = releaseDate.split(" ");
          const monthMap = {
            Jan: "01",
            Feb: "02",
            Mar: "03",
            Apr: "04",
            May: "05",
            Jun: "06",
            Jul: "07",
            Aug: "08",
            Sep: "09",
            Oct: "10",
            Nov: "11",
            Dec: "12",
          };

          const month = monthMap[dateParts[0]];
          const day = dateParts[1]?.replace(",", ""); // Safely access day
          const year = dateParts[2];

          if (month && day && year) {
            formattedDate = `${year}-${month}-${day}`;
          } else {
            console.warn(`Invalid release date format: ${releaseDate}`);
            formattedDate = "0000-00-00";
          }
        } else {
          console.warn(`Invalid or missing release date: ${releaseDate}`);
          formattedDate = "0000-00-00";
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(formattedDate)) {
          console.warn(
            `Formatted date is not in the correct format: ${formattedDate}`
          );
          formattedDate = "0000-00-00"; // Fallback if the formatted date is invalid
        }

        await conn.execute(
          `INSERT INTO game (steamID, currency, description, genre, image, name, price, release_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            steam_appid,
            "USD",
            short_description,
            genre,
            header_image,
            name,
            price,
            formattedDate,
          ]
        );
      }
      console.log("Games successfully loaded into the database.");
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("Error loading games into the database:", error);
  }
}

// Start the server and load games into the database
app.listen(3000, async () => {
  console.log("Express server running on port 3000");
  // await loadGamesIntoDatabase();
});
