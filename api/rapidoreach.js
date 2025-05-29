const https = require("https");

const API_AUTH_KEY = process.env.API_AUTH_KEY;
const RAPIDO_APP_ID = process.env.RAPIDO_APP_ID;
const RAPIDO_APP_KEY = process.env.RAPIDO_APP_KEY;
const RAPIDO_APP_SECRET = process.env.RAPIDO_APP_SECRET;

const VERCEL_LOG = console.log;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://vestinoo.pages.dev");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();

  const authHeader = req.headers["x-api-key"];
  if (!authHeader || authHeader !== API_AUTH_KEY) {
    return res.status(401).json({ error: "Unauthorized request" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uid, ip, city, countryLang } = req.body;

    if (!uid || !ip || !city || !countryLang) {
      return res.status(400).json({ error: "Missing required user fields" });
    }

    const payload = {
      UserId: uid,
      AppId: RAPIDO_APP_ID,
      IpAddress: ip,
      City: city,
      CountryLanguageCode: countryLang
    };

    const dataString = JSON.stringify(payload);

    const options = {
      hostname: "www.rapidoreach.com",
      path: "/getallsurveys-api/",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(dataString),
        "X-RapidoReach-Api-Key": RAPIDO_APP_KEY
      }
    };

    const rapidoReq = https.request(options, rapidoRes => {
      let body = "";
      rapidoRes.on("data", chunk => body += chunk);
      rapidoRes.on("end", () => {
        try {
          const result = JSON.parse(body);
          VERCEL_LOG("[RapidoReach Response]:", result);
          return res.status(200).json(result);
        } catch (err) {
          VERCEL_LOG("[Parse Error]:", err);
          return res.status(500).json({ error: "Invalid JSON in response from RapidoReach" });
        }
      });
    });

    rapidoReq.on("error", error => {
      VERCEL_LOG("[Request Error]:", error);
      return res.status(500).json({ error: "Error contacting RapidoReach" });
    });

    rapidoReq.write(dataString);
    rapidoReq.end();

  } catch (err) {
    VERCEL_LOG("[Unhandled Error]:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
