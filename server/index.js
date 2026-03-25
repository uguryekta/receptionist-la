import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { VapiClient } from "@vapi-ai/server-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://receptionistla.com",
    "https://www.receptionistla.com",
    "https://receptionistla.netlify.app"
  ]
}));
app.use(express.json());

const vapi = new VapiClient({ token: process.env.VAPI_API_KEY });

// ---------------------------------------------------------------------------
// Persistent file-based agent storage
// ---------------------------------------------------------------------------
const AGENTS_FILE = path.join(__dirname, "agents.json");
const agents = new Map();

function loadAgents() {
  try {
    if (fs.existsSync(AGENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf-8"));
      for (const agent of data) {
        agents.set(agent.id, agent);
      }
      console.log(`Loaded ${agents.size} agent(s) from disk.`);
    }
  } catch (err) {
    console.error("Error loading agents from disk:", err.message);
  }
}

function saveAgents() {
  try {
    const data = Array.from(agents.values());
    fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving agents to disk:", err.message);
  }
}

loadAgents();

// ---------------------------------------------------------------------------
// Auth: Users store (TODO: Replace with database)
// ---------------------------------------------------------------------------
const users = new Map();

// Create default admin user from env vars on startup
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@receptionistla.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
users.set(ADMIN_EMAIL, { email: ADMIN_EMAIL, passwordHash: adminHash, role: "admin" });
console.log(`Default admin user: ${ADMIN_EMAIL}`);

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const user = users.get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = jwt.sign({ email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: "24h",
  });
  return res.json({ token, user: { email: user.email, role: user.role } });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me - Verify token
// ---------------------------------------------------------------------------
app.get("/api/auth/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function twilioAuthHeader() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  return "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

/**
 * Buy a Twilio phone number via the REST API (no twilio npm package).
 */
async function buyTwilioNumber(areaCode = "213") {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;

  // Search for available numbers
  const searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${areaCode}&Limit=1`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: twilioAuthHeader() },
  });
  const searchData = await searchRes.json();

  if (!searchData.available_phone_numbers?.length) {
    throw new Error(`No phone numbers available in area code ${areaCode}`);
  }

  const numberToBuy = searchData.available_phone_numbers[0].phone_number;

  // Purchase the number
  const buyUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`;
  const buyRes = await fetch(buyUrl, {
    method: "POST",
    headers: {
      Authorization: twilioAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `PhoneNumber=${encodeURIComponent(numberToBuy)}`,
  });
  const buyData = await buyRes.json();

  if (!buyData.phone_number) {
    throw new Error(`Failed to buy Twilio number: ${JSON.stringify(buyData)}`);
  }

  return { number: buyData.phone_number, sid: buyData.sid };
}

/**
 * Release (delete) a Twilio phone number by its SID.
 */
async function releaseTwilioNumber(numberSid) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${numberSid}.json`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: twilioAuthHeader() },
  });
  // Twilio returns 204 on success
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    throw new Error(`Failed to release Twilio number ${numberSid}: ${body}`);
  }
}

/**
 * Build the Vapi assistant model config (no transfer — AI answers directly).
 */
function buildAssistantModel(masterPrompt) {
  const systemContent =
    masterPrompt +
    "\n\nYou are a friendly and helpful AI receptionist. Answer questions about the business, help customers with product inquiries, take messages, and assist with any requests. Be warm, professional, and concise.";

  return {
    provider: "openai",
    model: "gpt-4o",
    messages: [{ role: "system", content: systemContent }],
  };
}

// ---------------------------------------------------------------------------
// POST /api/agents - Create a new AI agent
// ---------------------------------------------------------------------------
app.post("/api/agents", requireAuth, async (req, res) => {
  try {
    const { businessName, ownerPhone, masterPrompt, ownerEmail, areaCode } =
      req.body;

    if (!businessName || !masterPrompt || !ownerPhone) {
      return res.status(400).json({
        error: "businessName, ownerPhone, and masterPrompt are required",
      });
    }

    // 1. Create Vapi assistant with transferCall tool
    const assistant = await vapi.assistants.create({
      name: `${businessName} Receptionist`,
      firstMessage: `Hello! Thank you for calling ${businessName}. How can I help you today?`,
      model: buildAssistantModel(masterPrompt),
      voice: { provider: "11labs", voiceId: "burt" },
    });
    console.log(`Created Vapi assistant: ${assistant.id}`);

    // 2. Use existing Twilio number or buy a new one
    const EXISTING_TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER || "+18444922681";
    let twilioNumber = { number: EXISTING_TWILIO_NUMBER, sid: null };
    let vapiPhone;

    // Check if the Twilio number is already imported in Vapi (use REST API directly)
    try {
      const listRes = await fetch("https://api.vapi.ai/phone-number", {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      });
      const allNumbers = await listRes.json();
      const existing = Array.isArray(allNumbers)
        ? allNumbers.find((p) => p.number === EXISTING_TWILIO_NUMBER && p.provider === "twilio")
        : null;
      if (existing) {
        // Update existing Vapi phone number to point to the new assistant
        const updateRes = await fetch(`https://api.vapi.ai/phone-number/${existing.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ assistantId: assistant.id }),
        });
        vapiPhone = await updateRes.json();
        console.log(`Updated existing Vapi phone number: ${vapiPhone.id}`);
      }
    } catch (err) {
      console.log("Could not check existing numbers:", err.message);
    }

    // If not found, import the Twilio number into Vapi
    if (!vapiPhone) {
      vapiPhone = await vapi.phoneNumbers.create({
        provider: "twilio",
        number: EXISTING_TWILIO_NUMBER,
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
        assistantId: assistant.id,
      });
      console.log(`Imported number into Vapi: ${vapiPhone.id}`);
    }

    // 3. Store and return the agent
    const agent = {
      id: crypto.randomUUID(),
      assistantId: assistant.id,
      phoneNumberId: vapiPhone.id,
      twilioNumber: twilioNumber.number,
      twilioNumberSid: twilioNumber.sid,
      businessName,
      ownerPhone,
      masterPrompt,
      ownerEmail: ownerEmail || null,
      createdAt: new Date().toISOString(),
    };

    agents.set(agent.id, agent);
    saveAgents();

    return res.status(201).json({ agent });
  } catch (err) {
    console.error("Error creating agent:", err);
    return res
      .status(500)
      .json({ error: "Failed to create agent", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/agents - List all agents
// ---------------------------------------------------------------------------
app.get("/api/agents", requireAuth, (_req, res) => {
  const list = Array.from(agents.values());
  return res.json({ agents: list });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id - Get a single agent
// ---------------------------------------------------------------------------
app.get("/api/agents/:id", requireAuth, (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: "Agent not found" });
  }
  return res.json({ agent });
});

// ---------------------------------------------------------------------------
// PATCH /api/agents/:id - Update agent
// ---------------------------------------------------------------------------
app.patch("/api/agents/:id", requireAuth, async (req, res) => {
  try {
    const agent = agents.get(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const { masterPrompt, businessName, ownerPhone } = req.body;

    const promptChanged = masterPrompt && masterPrompt !== agent.masterPrompt;
    const phoneChanged = ownerPhone && ownerPhone !== agent.ownerPhone;

    // If either masterPrompt or ownerPhone changed, rebuild the model config
    if (promptChanged || phoneChanged) {
      const newPrompt = masterPrompt || agent.masterPrompt;
      const newPhone = ownerPhone || agent.ownerPhone;

      await vapi.assistants.update(agent.assistantId, {
        model: buildAssistantModel(newPrompt),
      });

      if (promptChanged) agent.masterPrompt = masterPrompt;
      if (phoneChanged) agent.ownerPhone = ownerPhone;
    }

    if (businessName && businessName !== agent.businessName) {
      agent.businessName = businessName;
      await vapi.assistants.update(agent.assistantId, {
        name: `${businessName} Receptionist`,
      });
    }

    agents.set(agent.id, agent);
    saveAgents();

    return res.json({ agent });
  } catch (err) {
    console.error("Error updating agent:", err);
    return res
      .status(500)
      .json({ error: "Failed to update agent", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/agents/:id - Delete agent
// ---------------------------------------------------------------------------
app.delete("/api/agents/:id", requireAuth, async (req, res) => {
  try {
    const agent = agents.get(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    // Delete Vapi phone number
    try {
      await vapi.phoneNumbers.delete(agent.phoneNumberId);
    } catch (err) {
      console.error("Error deleting Vapi phone number:", err.message);
    }

    // Delete Vapi assistant
    try {
      await vapi.assistants.delete(agent.assistantId);
    } catch (err) {
      console.error("Error deleting Vapi assistant:", err.message);
    }

    // Release the Twilio number
    if (agent.twilioNumberSid) {
      try {
        await releaseTwilioNumber(agent.twilioNumberSid);
        console.log(`Released Twilio number: ${agent.twilioNumber} (${agent.twilioNumberSid})`);
      } catch (err) {
        console.error("Error releasing Twilio number:", err.message);
      }
    }

    agents.delete(agent.id);
    saveAgents();

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting agent:", err);
    return res
      .status(500)
      .json({ error: "Failed to delete agent", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scrape-website - Fetch & extract business info from a website
// ---------------------------------------------------------------------------
app.post("/api/scrape-website", requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Normalize URL
    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http")) {
      targetUrl = "https://" + targetUrl;
    }

    // Fetch the website HTML
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ReceptionistLA/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Website returned status ${response.status}`);
    }

    const html = await response.text();

    // Extract useful text content (strip HTML tags, scripts, styles)
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 8000); // Limit to 8000 chars

    // Extract meta description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1] : "";

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : "";

    // Try to find phone numbers
    const phoneMatches = cleaned.match(/(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g) || [];
    const phones = [...new Set(phoneMatches)].slice(0, 3);

    // Try to find email addresses
    const emailMatches = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const emails = [...new Set(emailMatches)].slice(0, 3);

    // Try to find address patterns
    const addressMatch = cleaned.match(/\d+\s+[\w\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Way|Ln|Lane|Ct|Court|Pl|Place)[.,]?\s*(?:Suite|Ste|#|Apt)?\s*\d*[.,]?\s*(?:Los Angeles|LA|Hollywood|Beverly Hills|Santa Monica|Pasadena|Burbank|Glendale|Long Beach|Torrance|Culver City|West Hollywood|Venice|Sherman Oaks|Encino|Tarzana|Woodland Hills|Northridge|Van Nuys|Studio City|North Hollywood|Koreatown|Downtown|Echo Park|Silver Lake|Los Feliz|Highland Park|Eagle Rock|Atwater Village|Glassell Park|Mount Washington)[.,]?\s*(?:CA|California)?\s*\d{0,5}/i);
    const address = addressMatch ? addressMatch[0].trim() : "";

    // Try to find hours
    const hoursPatterns = cleaned.match(/(?:hours|open|schedule|we're open|we are open)[:\s]*([^.]{10,150})/i);
    const hours = hoursPatterns ? hoursPatterns[1].trim() : "";

    return res.json({
      success: true,
      data: {
        pageTitle,
        metaDescription: metaDesc,
        phones,
        emails,
        address,
        hours,
        content: cleaned.substring(0, 4000),
      },
    });
  } catch (err) {
    console.error("Error scraping website:", err.message);
    return res.status(500).json({
      error: "Failed to fetch website info",
      details: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
