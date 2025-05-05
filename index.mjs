import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fetch from "node-fetch";
import seedrandom from "seedrandom";
import session from "express-session"

const app = express();
dotenv.config();

app.set("view engine", "ejs");
app.use(express.static("public"));

//for Express to get values using POST method
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1);
app.use(
  session({
    secret: process.env.PROXY_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// setting up database connection pool
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

app.get("/home", (req, res) => { // home route
  res.render("home");
});

app.get("/lists", async (req, res) => { // lists route
  let userID = 2;
  // let sql = `SELECT * FROM user LEFT JOIN ON userID = wishlist.userID LEFT JOIN ON wishlist.wishlistID WHERE userID = ?;`;
  let sql = `SELECT 
              u.userID,
              u.username,
              u.email,
              w.wishlistID,
              w.name AS name
              FROM \`user\` AS u
              LEFT JOIN wishlist AS w
              ON u.userID = w.userID
              WHERE u.userID = ?`;
  let sqlParams = [userID];
  const [rows] = await conn.query(sql, sqlParams);

  const user = rows.length
    ? { userID: rows[0].userID, username: rows[0].username, email: rows[0].email }
    : { };

  // collect only the non-null wishlists
  const wishlist = rows
    .filter(r => r.wishlistID != null)
    .map(r => ({ id: r.wishlistID, name: r.name }));

  res.render("lists", { user, wishlist });
  // res.send({ user, wishlist });
}); 
app.get("/editWishlist", async (req, res) => {
  let userID = 2;

  let sql = `SELECT 
              u.userID,
              u.username,
              u.email,
              w.wishlistID,
              w.name AS name
              FROM \`user\` AS u
              LEFT JOIN wishlist AS w
              ON u.userID = w.userID
              WHERE u.userID = ?`;
  let sqlParams = [userID];
  const [rows] = await conn.query(sql, sqlParams);

  const user = rows.length
  ? { userID: rows[0].userID, username: rows[0].username, email: rows[0].email }
  : { };
  // collect only the non-null wishlists
  const wishlist = rows
    .filter(r => r.wishlistID != null)
    .map(r => ({ id: r.wishlistID, name: r.name }));

  let sql2 = `SELECT 
              wi.wishlistitemID,
              wi.wishlistID,
              wi.gameID,
              g.steamID,
              g.price,
              g.name,
              g.currency,
              g.genre,
              g.image,
              g.description
              FROM wishlistitem AS wi
              LEFT JOIN game AS g
              ON wi.gameID = g.steamID
              WHERE wi.wishlistID = ?`; // start again here to load all games in wishlist
  let sqlParams2 = [3];
  const [rows2] = await conn.query(sql2, sqlParams2);
  // const games = rows2.length
  // ? { steamID: rows2.steamID, name: rows2.name, image: rows2.image, description: rows2.description, genre: rows2.genre, price: rows2.price, currency: rows2.currency }
  // : { };
  // // collect only the non-null wishlists
  const games = rows2
    .filter(r => r.steamID != null)
    .map(r => ({ id: r.steamID, name: r.name, image: r.image, description: r.description, genre: r.genre, price: r.price, currency: r.currency }));

  
  // res.send(games);
  res.render("viewList", { games });
});

app.get("/api/game", async (req, res) => {
  showGames();
  res.render("home");
});
app.get("/api/wishlist", async (req, res) => {
  showWishlists();
  res.render("home");
});
app.get("/api/wishlistitem", async (req, res) => {
  showWishlistitems();
  res.render("home");
});
app.get("/api/addGame", async (req, res) => {
  addGameToWishlist();
  res.render("home");
});

app.get("/signup", (req, res) => { // signup route
  res.render("signup");
});

app.post("/signup", async (req, res) => { // signup post route
  try{
    let username = req.body.username;
    let password = req.body.password;
    let email = req.body.email;

    // create new user in database
    let sql = `INSERT INTO user (username, password, email) VALUES (?, ?, ?)`;
    let sqlParams = [username, password, email];
    await conn.query(sql, sqlParams);

    // get userID of new user
    let sql2 = `SELECT user.userID FROM user WHERE user.username = ?`;
    sqlParams = [username];
    const [rows] = await conn.query(sql2, sqlParams);

    // create new wishlist for user
    let sql3 = `INSERT INTO wishlist (name, userID) VALUES (?, ?);`;
    sqlParams = [`${username}'s WishList`, rows[0].userID];
    await conn.query(sql3, sqlParams);

    req.session.userID = rows[0].userID;
    res.redirect("/home"); // redirect to home after signup
  } catch (error) {
    console.error("Error during signup:", error.sqlMessage.slice(-15, -1));
    if(error.sqlMessage.slice(-15, -1).includes("user.username")) {
      res.render("signup", { error: "Username already exists. Please choose another one." });
    } else if(error.sqlMessage.slice(-15, -1).includes("user.email")) {
      res.render("signup", { error: "Email already exists. Please choose another one." });
    } else {
      res.status(500).send("An error occurred during signup.");
    }
  }
}); 


app.listen(3000, () => {
  console.log("Express server running");
});

async function showGames(){
  let sql = `SELECT * FROM game`;
  const [rows] = await conn.query(sql);
  console.log(rows);
}
async function showWishlists(){
  let sql = `SELECT * FROM wishlist`;
  const [rows] = await conn.query(sql);
  console.log(rows);
}
async function showWishlistitems(){
  let sql = `SELECT * FROM wishlistitem`;
  const [rows] = await conn.query(sql);
  console.log(rows);
}

async function addGameToWishlist() {
  let sql = `INSERT INTO wishlistitem (wishlistID, gameID) VALUES (3, 2186350)`;
  await conn.query(sql);
}