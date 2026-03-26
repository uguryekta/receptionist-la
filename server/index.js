import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pg from "pg";
import Stripe from "stripe";
import { VapiClient } from "@vapi-ai/server-sdk";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

// Stripe setup
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://receptionistla.com",
    "https://www.receptionistla.com",
    "https://receptionistla.netlify.app"
  ],
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));

// Stripe webhook needs raw body — MUST come before express.json()
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Stripe event: ${event.type}`);

  if (event.type === "checkout.session.completed" || event.type === "payment_link.completed") {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email || session.customer_email;
    const customerName = session.customer_details?.name || "";
    const stripeCustomerId = session.customer;
    const subscriptionId = session.subscription;

    if (customerEmail) {
      try {
        // Check if customer already exists
        const existing = await getCustomerByEmail(customerEmail);
        if (existing) {
          // Update subscription info
          await pool.query(
            `UPDATE customers SET stripe_customer_id = $1, stripe_subscription_id = $2, status = 'active', plan = 'standard' WHERE id = $3`,
            [stripeCustomerId, subscriptionId, existing.id]
          );
          console.log(`Updated existing customer: ${customerEmail}`);
        } else {
          // Generate a placeholder password (customer will set their own via setup link)
          const tempPassword = crypto.randomBytes(32).toString("hex");
          const passwordHash = bcrypt.hashSync(tempPassword, 10);
          const setupToken = crypto.randomBytes(32).toString("hex");

          const customerId = crypto.randomUUID();
          await pool.query(
            `INSERT INTO customers (id, email, password_hash, name, stripe_customer_id, stripe_subscription_id, plan, status, setup_token)
             VALUES ($1, $2, $3, $4, $5, $6, 'standard', 'active', $7)`,
            [customerId, customerEmail.toLowerCase(), passwordHash, customerName, stripeCustomerId, subscriptionId, setupToken]
          );

          console.log(`New customer created: ${customerEmail}, setup token: ${setupToken}`);
        }
      } catch (err) {
        console.error("Error processing Stripe webhook:", err.message);
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    try {
      await pool.query(
        `UPDATE customers SET status = 'cancelled' WHERE stripe_subscription_id = $1`,
        [subscription.id]
      );
      console.log(`Subscription cancelled: ${subscription.id}`);
    } catch (err) {
      console.error("Error handling subscription cancellation:", err.message);
    }
  }

  return res.json({ received: true });
});

app.use(express.json({ limit: "5mb" }));

const vapi = new VapiClient({ token: process.env.VAPI_API_KEY });

// ---------------------------------------------------------------------------
// PostgreSQL database
// ---------------------------------------------------------------------------
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        phone_number_id TEXT,
        twilio_number TEXT,
        twilio_number_sid TEXT,
        business_name TEXT NOT NULL,
        owner_phone TEXT,
        master_prompt TEXT,
        owner_email TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        active BOOLEAN DEFAULT TRUE,
        customer_id TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT DEFAULT '',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        plan TEXT DEFAULT 'standard',
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add customer_id column to agents if it doesn't exist
    await client.query(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS customer_id TEXT
    `).catch(() => {});

    // Add setup_token column to customers if it doesn't exist
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS setup_token TEXT
    `).catch(() => {});

    console.log("Database initialized.");
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Customer helpers
// ---------------------------------------------------------------------------
async function getCustomerByEmail(email) {
  const { rows } = await pool.query("SELECT * FROM customers WHERE email = $1", [email.toLowerCase()]);
  return rows[0] || null;
}

async function getCustomerById(id) {
  const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [id]);
  return rows[0] || null;
}

async function getAllCustomers() {
  const { rows } = await pool.query("SELECT * FROM customers ORDER BY created_at DESC");
  return rows;
}

async function getAgentsByCustomerId(customerId) {
  const { rows } = await pool.query("SELECT * FROM agents WHERE customer_id = $1 ORDER BY created_at DESC", [customerId]);
  return rows.map(rowToAgent);
}

function rowToAgent(row) {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    phoneNumberId: row.phone_number_id,
    twilioNumber: row.twilio_number,
    twilioNumberSid: row.twilio_number_sid,
    businessName: row.business_name,
    ownerPhone: row.owner_phone,
    masterPrompt: row.master_prompt,
    ownerEmail: row.owner_email,
    createdAt: row.created_at,
    active: row.active,
    customerId: row.customer_id,
  };
}

async function getAllAgents() {
  const { rows } = await pool.query("SELECT * FROM agents ORDER BY created_at DESC");
  return rows.map(rowToAgent);
}

async function getAgent(id) {
  const { rows } = await pool.query("SELECT * FROM agents WHERE id = $1", [id]);
  return rows[0] ? rowToAgent(rows[0]) : null;
}

async function saveAgent(agent) {
  await pool.query(
    `INSERT INTO agents (id, assistant_id, phone_number_id, twilio_number, twilio_number_sid, business_name, owner_phone, master_prompt, owner_email, created_at, active, customer_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       assistant_id=EXCLUDED.assistant_id, phone_number_id=EXCLUDED.phone_number_id,
       twilio_number=EXCLUDED.twilio_number, twilio_number_sid=EXCLUDED.twilio_number_sid,
       business_name=EXCLUDED.business_name, owner_phone=EXCLUDED.owner_phone,
       master_prompt=EXCLUDED.master_prompt, owner_email=EXCLUDED.owner_email,
       active=EXCLUDED.active, customer_id=EXCLUDED.customer_id`,
    [agent.id, agent.assistantId, agent.phoneNumberId, agent.twilioNumber,
     agent.twilioNumberSid, agent.businessName, agent.ownerPhone, agent.masterPrompt,
     agent.ownerEmail, agent.createdAt, agent.active ?? true, agent.customerId || null]
  );
}

async function deleteAgent(id) {
  await pool.query("DELETE FROM agents WHERE id = $1", [id]);
}

initDB().catch((err) => console.error("DB init error:", err.message));

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

  // Check admin first
  const adminUser = users.get(email.toLowerCase());
  if (adminUser && bcrypt.compareSync(password, adminUser.passwordHash)) {
    const token = jwt.sign({ email: adminUser.email, role: "admin" }, JWT_SECRET, {
      expiresIn: "24h",
    });
    return res.json({ token, user: { email: adminUser.email, role: "admin" } });
  }

  // Check customer
  try {
    const customer = await getCustomerByEmail(email);
    if (customer && bcrypt.compareSync(password, customer.password_hash)) {
      if (customer.status !== "active") {
        return res.status(403).json({ error: "Your subscription is not active. Please contact support." });
      }
      const token = jwt.sign(
        { email: customer.email, role: "customer", customerId: customer.id },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      return res.json({
        token,
        user: { email: customer.email, role: "customer", customerId: customer.id, name: customer.name },
      });
    }
  } catch (err) {
    console.error("Customer login check error:", err.message);
  }

  return res.status(401).json({ error: "Invalid email or password" });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me - Verify token
// ---------------------------------------------------------------------------
app.get("/api/auth/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

// POST /api/auth/verify-setup-token - Verify a setup token is valid
app.post("/api/auth/verify-setup-token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });

    const result = await pool.query(
      `SELECT id, email, name FROM customers WHERE setup_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired setup link" });
    }

    const customer = result.rows[0];
    return res.json({ valid: true, email: customer.email, name: customer.name });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/set-password - Set password using setup token
app.post("/api/auth/set-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: "Token and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const result = await pool.query(
      `SELECT id, email, name FROM customers WHERE setup_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired setup link" });
    }

    const customer = result.rows[0];
    const passwordHash = bcrypt.hashSync(password, 10);

    // Set password and clear the setup token (one-time use)
    await pool.query(
      `UPDATE customers SET password_hash = $1, setup_token = NULL WHERE id = $2`,
      [passwordHash, customer.id]
    );

    // Auto-login: return a JWT token
    const jwtToken = jwt.sign(
      { id: customer.id, email: customer.email, role: "customer", name: customer.name },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({
      message: "Password set successfully!",
      token: jwtToken,
      user: { id: customer.id, email: customer.email, role: "customer", name: customer.name },
    });
  } catch (err) {
    console.error("Error setting password:", err.message);
    return res.status(500).json({ error: "Failed to set password" });
  }
});

// POST /api/auth/reset-setup-token - Admin regenerates a setup link
app.post("/api/auth/reset-setup-token/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const setupToken = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `UPDATE customers SET setup_token = $1 WHERE id = $2`,
      [setupToken, customer.id]
    );

    return res.json({ setupToken });
  } catch (err) {
    return res.status(500).json({ error: "Failed to generate setup link" });
  }
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
    "\n\nYou are a friendly and helpful AI receptionist. Answer questions about the business, help customers with product inquiries, take messages, and assist with any requests. Be warm, professional, and concise." +
    "\n\nYou are fully bilingual in English and Spanish. If the caller speaks Spanish, respond entirely in Spanish. If they speak English, respond in English. Seamlessly switch languages mid-conversation if the caller switches.";

  return {
    provider: "openai",
    model: "gpt-4o",
    messages: [{ role: "system", content: systemContent }],
  };
}

// ---------------------------------------------------------------------------
// POST /api/vapi/webhook - Vapi server URL for call events (SMS on end-of-call)
// ---------------------------------------------------------------------------
app.post("/api/vapi/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("Vapi webhook received:", JSON.stringify(body).substring(0, 500));

    // Vapi can send payload as { message: { type, ... } } or directly as { type, ... }
    const msg = body.message || body;
    const msgType = msg.type;

    // Handle end-of-call-report
    if (msgType === "end-of-call-report") {
      const summary = msg.summary || msg.analysis?.summary || "";
      const transcript = msg.transcript || msg.artifact?.transcript || [];
      const NOTIFY_PHONE = process.env.NOTIFY_PHONE || "+15304076816";

      let leadInfo = "🔔 New lead from ReceptionistLA demo!\n\n";
      if (summary) {
        leadInfo += `Summary: ${summary}\n\n`;
      }
      if (transcript && transcript.length > 0) {
        const fullTranscript = typeof transcript === "string"
          ? transcript
          : transcript.map((t) => `${t.role}: ${t.message}`).join("\n");
        leadInfo += `Transcript:\n${fullTranscript.substring(0, 1400)}`;
      }

      // Send SMS via Twilio
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER || "+18444922681";

      if (twilioSid && twilioToken) {
        try {
          const smsBody = leadInfo.substring(0, 1600);
          const params = new URLSearchParams();
          params.append("To", NOTIFY_PHONE);
          params.append("From", twilioFrom);
          params.append("Body", smsBody);

          const smsRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: "Basic " + Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: params,
            }
          );
          const smsData = await smsRes.json();
          console.log(`SMS result: status=${smsData.status}, sid=${smsData.sid}, error=${smsData.message || "none"}`);
        } catch (smsErr) {
          console.error("Failed to send SMS:", smsErr.message);
        }
      } else {
        console.log("Twilio credentials not configured, skipping SMS");
      }
    }

    // For other Vapi events (function-call, speech-update, etc), respond with empty
    return res.json({});
  } catch (err) {
    console.error("Vapi webhook error:", err.message);
    return res.json({});
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents - Create a new AI agent
// ---------------------------------------------------------------------------
app.post("/api/agents", requireAuth, async (req, res) => {
  try {
    const { businessName, ownerPhone, masterPrompt, ownerEmail, areaCode, customerId } =
      req.body;

    if (!businessName || !masterPrompt || !ownerPhone) {
      return res.status(400).json({
        error: "businessName, ownerPhone, and masterPrompt are required",
      });
    }

    // 1. Create Vapi assistant with transferCall tool
    const assistant = await vapi.assistants.create({
      name: `${businessName} Receptionist`,
      firstMessage: `Hello! Thank you for calling ${businessName}. I can assist you in English or Spanish. How can I help you today?`,
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
      active: true,
      customerId: customerId || null,
    };

    await saveAgent(agent);

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
app.get("/api/agents", requireAuth, async (_req, res) => {
  const list = await getAllAgents();
  return res.json({ agents: list });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id - Get a single agent
// ---------------------------------------------------------------------------
app.get("/api/agents/:id", requireAuth, async (req, res) => {
  const agent = await getAgent(req.params.id);
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
    const agent = await getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const { masterPrompt, businessName, ownerPhone } = req.body;

    const promptChanged = masterPrompt && masterPrompt !== agent.masterPrompt;
    const phoneChanged = ownerPhone && ownerPhone !== agent.ownerPhone;

    // If either masterPrompt or ownerPhone changed, rebuild the model config
    if (promptChanged || phoneChanged) {
      const newPrompt = masterPrompt || agent.masterPrompt;

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

    await saveAgent(agent);

    return res.json({ agent });
  } catch (err) {
    console.error("Error updating agent:", err);
    return res
      .status(500)
      .json({ error: "Failed to update agent", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agents/:id/toggle - Activate/Deactivate agent
// ---------------------------------------------------------------------------
app.post("/api/agents/:id/toggle", requireAuth, async (req, res) => {
  try {
    const agent = await getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const newStatus = agent.active === false ? true : false;

    try {
      if (newStatus) {
        // Reactivate: restore full assistant
        await vapi.assistants.update(agent.assistantId, {
          model: buildAssistantModel(agent.masterPrompt),
          firstMessage: `Hello! Thank you for calling ${agent.businessName}. I can assist you in English or Spanish. How can I help you today?`,
        });
      } else {
        // Deactivate: replace everything with inactive message
        await vapi.assistants.update(agent.assistantId, {
          model: {
            provider: "openai",
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: "You are a temporary message system. The business line is currently inactive. After your greeting, if the caller asks anything, just repeat that the line is inactive and suggest trying again later.",
              },
            ],
          },
          firstMessage: "We're sorry, this line is currently inactive. Please try again later or visit our website. Goodbye.",
        });
      }
      // If activating, re-link the shared phone number to this agent
      if (newStatus) {
        const EXISTING_TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER || "+18444922681";
        const listRes = await fetch("https://api.vapi.ai/phone-number", {
          headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
        });
        const allNumbers = await listRes.json();
        const existing = Array.isArray(allNumbers)
          ? allNumbers.find((p) => p.number === EXISTING_TWILIO_NUMBER && p.provider === "twilio")
          : null;
        if (existing) {
          await fetch(`https://api.vapi.ai/phone-number/${existing.id}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ assistantId: agent.assistantId }),
          });
          console.log(`Re-linked phone number to activated agent: ${agent.businessName}`);
        }
      }
    } catch (vapiErr) {
      console.error("Vapi update failed during toggle:", vapiErr.message);
    }

    agent.active = newStatus;
    await saveAgent(agent);

    return res.json({ agent });
  } catch (err) {
    console.error("Error toggling agent:", err);
    return res.status(500).json({ error: "Failed to toggle agent", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/agents/:id - Delete agent
// ---------------------------------------------------------------------------
app.delete("/api/agents/:id", requireAuth, async (req, res) => {
  try {
    const agent = await getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    // Delete Vapi assistant (but NOT the shared phone number)
    try {
      await vapi.assistants.delete(agent.assistantId);
    } catch (err) {
      console.error("Error deleting Vapi assistant:", err.message);
    }

    await deleteAgent(agent.id);

    // Re-link the shared phone number to the next active agent (if any)
    try {
      const remaining = await pool.query(
        "SELECT * FROM agents WHERE id != $1 AND active = true ORDER BY created_at DESC LIMIT 1",
        [agent.id]
      );
      if (remaining.rows.length > 0) {
        const nextAgent = remaining.rows[0];
        const EXISTING_TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER || "+18444922681";
        const listRes = await fetch("https://api.vapi.ai/phone-number", {
          headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
        });
        const allNumbers = await listRes.json();
        const existing = Array.isArray(allNumbers)
          ? allNumbers.find((p) => p.number === EXISTING_TWILIO_NUMBER && p.provider === "twilio")
          : null;
        if (existing) {
          await fetch(`https://api.vapi.ai/phone-number/${existing.id}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ assistantId: nextAgent.assistant_id }),
          });
          console.log(`Re-linked phone number to agent: ${nextAgent.business_name} (${nextAgent.assistant_id})`);
        }
      }
    } catch (err) {
      console.error("Error re-linking phone number:", err.message);
    }

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
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Website returned status ${response.status}`);
    }

    const html = await response.text();

    // ---------- Extract structured data (JSON-LD) ----------
    const jsonLdData = {};
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const match of jsonLdMatches) {
      try {
        const jsonStr = match.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
        const data = JSON.parse(jsonStr);
        const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
        for (const item of items) {
          if (item.name) jsonLdData.name = jsonLdData.name || item.name;
          if (item.description) jsonLdData.description = jsonLdData.description || item.description;
          if (item.telephone) jsonLdData.phone = jsonLdData.phone || item.telephone;
          if (item.email) jsonLdData.email = jsonLdData.email || item.email;
          if (item.url) jsonLdData.website = jsonLdData.website || item.url;
          if (item.openingHours) {
            jsonLdData.hours = Array.isArray(item.openingHours) ? item.openingHours.join(", ") : item.openingHours;
          }
          if (item.openingHoursSpecification) {
            const specs = Array.isArray(item.openingHoursSpecification) ? item.openingHoursSpecification : [item.openingHoursSpecification];
            const dayMap = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
            jsonLdData.hours = specs.map((s) => {
              const days = Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek];
              const dayNames = days.map((d) => dayMap[d?.replace("https://schema.org/", "")] || d).join(", ");
              return `${dayNames}: ${s.opens || "?"} - ${s.closes || "?"}`;
            }).join("; ");
          }
          if (item.address) {
            const addr = item.address;
            if (typeof addr === "string") {
              jsonLdData.address = addr;
            } else {
              jsonLdData.address = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(", ");
            }
          }
          if (item["@type"]) {
            const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
            const bizType = types.find((t) => !["WebSite", "WebPage", "Organization", "BreadcrumbList", "SearchAction", "ItemList"].includes(t));
            if (bizType) jsonLdData.industry = jsonLdData.industry || bizType.replace(/([a-z])([A-Z])/g, "$1 $2");
          }
          // Extract services from hasOfferCatalog or makesOffer
          if (item.hasOfferCatalog?.itemListElement) {
            const offers = item.hasOfferCatalog.itemListElement;
            jsonLdData.services = offers.map((o) => o.name || o.itemOffered?.name).filter(Boolean);
          }
          if (item.makesOffer) {
            const offers = Array.isArray(item.makesOffer) ? item.makesOffer : [item.makesOffer];
            jsonLdData.services = (jsonLdData.services || []).concat(
              offers.map((o) => o.itemOffered?.name || o.name).filter(Boolean)
            );
          }
          // Payment accepted
          if (item.paymentAccepted) jsonLdData.paymentMethods = item.paymentAccepted;
          // Languages
          if (item.availableLanguage) {
            const langs = Array.isArray(item.availableLanguage) ? item.availableLanguage : [item.availableLanguage];
            jsonLdData.languages = langs.map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean).join(", ");
          }
          // Price range
          if (item.priceRange) jsonLdData.priceRange = item.priceRange;
          // Area served
          if (item.areaServed) {
            const areas = Array.isArray(item.areaServed) ? item.areaServed : [item.areaServed];
            jsonLdData.serviceArea = areas.map((a) => (typeof a === "string" ? a : a.name)).filter(Boolean).join(", ");
          }
        }
      } catch (_) {
        // Skip invalid JSON-LD
      }
    }

    // ---------- Extract text content ----------
    // Keep list items as separate entries for service extraction
    const htmlForLists = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");

    // Extract list items (often used for services/features)
    const listItems = [];
    const liMatches = htmlForLists.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
    for (const li of liMatches) {
      const text = li.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 3 && text.length < 150) {
        listItems.push(text);
      }
    }

    // Extract headings for context
    const headings = [];
    const hMatches = htmlForLists.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi) || [];
    for (const h of hMatches) {
      const text = h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 2 && text.length < 200) {
        headings.push(text);
      }
    }

    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 12000);

    // ---------- Extract meta info ----------
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1] : "";

    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const ogDesc = ogDescMatch ? ogDescMatch[1] : "";

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : "";

    // ---------- Extract contact info ----------
    const phoneMatches = cleaned.match(/(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g) || [];
    const phones = [...new Set(phoneMatches)].slice(0, 3);

    const emailMatches = cleaned.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const emails = [...new Set(emailMatches.filter((e) => !e.includes("sentry") && !e.includes("webpack") && !e.includes("example")))].slice(0, 3);

    // ---------- Extract address ----------
    let address = jsonLdData.address || "";
    if (!address) {
      const addrMatch = cleaned.match(/(\d+\s+[\w\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Way|Ln|Lane|Ct|Court|Pl|Place)[.,]?\s*(?:Suite|Ste|#|Apt)?\s*\d*[.,]?\s*[A-Za-z\s]+,\s*(?:CA|California)\s*\d{0,5})/i);
      if (addrMatch) address = addrMatch[0].trim();
    }

    // ---------- Extract hours ----------
    let hours = jsonLdData.hours || "";
    if (!hours) {
      // Try day-time patterns
      const hoursBlock = cleaned.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[\w]*\s*[-:]\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?[\w]*\s*[-:]?\s*\d{1,2}[:\d]*\s*(?:AM|PM|am|pm)\s*[-–to]+\s*\d{1,2}[:\d]*\s*(?:AM|PM|am|pm)[\s\S]{0,300})/i);
      if (hoursBlock) {
        hours = hoursBlock[1].substring(0, 300).trim();
      } else {
        const hoursFallback = cleaned.match(/(?:hours|open|schedule)[:\s]*([^.]{10,200})/i);
        if (hoursFallback) hours = hoursFallback[1].trim();
      }
    }

    // ---------- Extract services ----------
    let services = jsonLdData.services || [];

    // Look for services section in the HTML
    if (services.length === 0) {
      // Find list items near "service" headings
      const serviceHeadingIdx = headings.findIndex((h) =>
        /services?|what we (?:do|offer)|our (?:services|offerings|treatments|specialties|menu)|menu/i.test(h)
      );

      if (serviceHeadingIdx >= 0) {
        // Get the HTML section after that heading for list items
        const serviceHeading = headings[serviceHeadingIdx];
        const headingRegex = new RegExp(serviceHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const headingPos = cleaned.search(headingRegex);
        if (headingPos >= 0) {
          const sectionText = cleaned.substring(headingPos, headingPos + 1500);
          // Extract items that look like services (capitalized phrases, bullet-point style)
          const serviceItems = sectionText.match(/(?:^|\s)([A-Z][\w\s&,/'-]{3,60})(?:\s*[-–|•]|\s*\$|\s*[.:])/gm) || [];
          services = serviceItems.map((s) => s.trim()).filter((s) => s.length > 3 && s.length < 80).slice(0, 20);
        }
      }

      // Fallback: look for common service patterns in list items
      if (services.length === 0) {
        const serviceKeywords = /haircut|color|highlight|treatment|massage|facial|manicure|pedicure|wax|clean|repair|install|consult|inspection|exam|filling|crown|implant|orthodont|whiten|extraction|root canal|check-?up|oil change|brake|tire|alignment|tune|diagnos|cut|style|blowout|perm|extension|balayage|ombre|keratin|botox|filler|laser|peel|microderm|lash|brow|tattoo|piercing|detail|wash|polish|tint|wrap|body work|paint|dent/i;
        const serviceItems = listItems.filter((item) => serviceKeywords.test(item));
        if (serviceItems.length > 0) {
          services = serviceItems.slice(0, 20);
        }
      }

      // If still nothing, try extracting from patterns like "We offer X, Y, and Z"
      if (services.length === 0) {
        const offerMatch = cleaned.match(/(?:we (?:offer|provide|specialize in)|our services include|services?:)\s*([^.]{20,500})/i);
        if (offerMatch) {
          services = offerMatch[1].split(/[,;•|]/).map((s) => s.trim()).filter((s) => s.length > 3 && s.length < 80);
        }
      }
    }

    // ---------- Extract additional details ----------
    let description = jsonLdData.description || metaDesc || ogDesc || "";

    // Try to find an "about" section
    let aboutText = "";
    const aboutHeadingIdx = headings.findIndex((h) =>
      /about\s*(?:us)?|who we are|our story|our mission|welcome/i.test(h)
    );
    if (aboutHeadingIdx >= 0) {
      const aboutHeading = headings[aboutHeadingIdx];
      const aboutRegex = new RegExp(aboutHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const aboutPos = cleaned.search(aboutRegex);
      if (aboutPos >= 0) {
        aboutText = cleaned.substring(aboutPos + aboutHeading.length, aboutPos + aboutHeading.length + 600).trim();
        // Clean up to first sentence or two
        const sentences = aboutText.match(/[^.!?]+[.!?]+/g) || [];
        aboutText = sentences.slice(0, 3).join(" ").trim();
      }
    }

    // ---------- Extract languages ----------
    let languages = jsonLdData.languages || "";
    if (!languages) {
      const langMatch = cleaned.match(/(?:languages?|we speak|hablamos|se habla)[:\s]*([\w\s,&]+)/i);
      if (langMatch) languages = langMatch[1].trim();
    }

    // ---------- Extract payment methods ----------
    let paymentMethods = jsonLdData.paymentMethods || "";
    if (!paymentMethods) {
      const payMatch = cleaned.match(/(?:payment|we accept|accepted|pay(?:ment)?\s*methods?)[:\s]*([\w\s,&/]+)/i);
      if (payMatch) paymentMethods = payMatch[1].trim();
    }

    // ---------- Extract parking info ----------
    let parking = "";
    const parkingMatch = cleaned.match(/(?:parking)[:\s]*([^.]{10,150})/i);
    if (parkingMatch) parking = parkingMatch[1].trim();

    // ---------- Industry from headings/description ----------
    let industry = jsonLdData.industry || "";
    if (!industry && description) {
      // Try to infer from meta description
      const industryPatterns = [
        /(?:hair\s*salon|beauty\s*salon|barber)/i,
        /(?:dental|dentist|orthodont)/i,
        /(?:law\s*firm|attorney|lawyer|legal)/i,
        /(?:auto\s*(?:repair|body|shop)|mechanic|automotive)/i,
        /(?:restaurant|cafe|bistro|eatery|dining)/i,
        /(?:medical|doctor|physician|clinic|healthcare)/i,
        /(?:spa|wellness|massage|therapy)/i,
        /(?:plumb|electric|hvac|contractor|handyman|roofing)/i,
        /(?:real\s*estate|realt)/i,
        /(?:vet|veterinar|animal|pet)/i,
        /(?:fitness|gym|yoga|pilates|training)/i,
        /(?:photography|photographer|photo\s*studio)/i,
        /(?:daycare|childcare|preschool|tutoring|education)/i,
        /(?:cleaning|janitorial|maid)/i,
        /(?:landscaping|garden|lawn|tree\s*service)/i,
        /(?:insurance|financial|accounting|tax|cpa)/i,
        /(?:nail\s*salon|nail\s*spa|manicure)/i,
      ];
      const fullText = (description + " " + pageTitle).toLowerCase();
      for (const p of industryPatterns) {
        const m = fullText.match(p);
        if (m) {
          industry = m[0].charAt(0).toUpperCase() + m[0].slice(1);
          break;
        }
      }
    }

    return res.json({
      success: true,
      data: {
        pageTitle,
        metaDescription: metaDesc,
        description,
        aboutText,
        phones,
        emails,
        address,
        hours,
        services: services.slice(0, 25),
        languages,
        paymentMethods,
        parking,
        industry,
        serviceArea: jsonLdData.serviceArea || "",
        priceRange: jsonLdData.priceRange || "",
        headings: headings.slice(0, 15),
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
// POST /api/scrape-google-maps - Extract business info from Google Maps
// ---------------------------------------------------------------------------
app.post("/api/scrape-google-maps", requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Google Maps URL is required" });
    }

    let targetUrl = url.trim();

    // Short URLs (maps.app.goo.gl) use JS redirects that fetch() can't follow.
    // Use a HEAD request with redirect: "manual" to capture the Location header.
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(targetUrl)) {
      try {
        const headRes = await fetch(targetUrl, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
        });
        // The final URL after redirects
        if (headRes.url && headRes.url.includes("google.com/maps")) {
          targetUrl = headRes.url;
        }
      } catch (_) {
        // If HEAD fails, try GET with manual redirect
        try {
          const getRes = await fetch(targetUrl, {
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
          });
          const loc = getRes.headers.get("location");
          if (loc && loc.includes("google.com/maps")) {
            targetUrl = loc;
          }
        } catch (__) {
          // Continue with original URL
        }
      }
    }

    // Extract business name from URL path: /maps/place/Business+Name/
    const result = {};
    const placeMatch = targetUrl.match(/\/maps\/place\/([^/@]+)/);
    if (placeMatch) {
      result.businessName = decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
    }

    // Use Google Places API if key is available (much more reliable than scraping)
    const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (GOOGLE_API_KEY && result.businessName) {
      try {
        // Step 1: Find the place using Text Search
        const searchRes = await fetch(
          `https://places.googleapis.com/v1/places:searchText`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": GOOGLE_API_KEY,
              "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.types,places.rating,places.userRatingCount,places.primaryType,places.primaryTypeDisplayName",
            },
            body: JSON.stringify({ textQuery: result.businessName }),
            signal: AbortSignal.timeout(10000),
          }
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const place = searchData.places?.[0];
          if (place) {
            if (place.displayName?.text) result.businessName = place.displayName.text;
            if (place.formattedAddress) result.address = place.formattedAddress;
            if (place.nationalPhoneNumber) result.phone = place.nationalPhoneNumber;
            if (place.websiteUri) result.website = place.websiteUri;
            if (place.primaryTypeDisplayName?.text) {
              result.category = place.primaryTypeDisplayName.text;
            } else if (place.primaryType) {
              result.category = place.primaryType.replace(/_/g, " ");
            }
            if (place.rating) {
              result.rating = `${place.rating}/5 (${place.userRatingCount || "?"} reviews)`;
            }
            if (place.regularOpeningHours?.weekdayDescriptions) {
              result.hours = place.regularOpeningHours.weekdayDescriptions.join("; ");
            }
            // Determine service area from address
            if (result.address) {
              const cityMatch = result.address.match(/,\s*([A-Za-z\s]+),\s*[A-Z]{2}/);
              if (cityMatch) {
                result.serviceArea = `${cityMatch[1].trim()} and surrounding areas`;
              }
            }
          }
        }
      } catch (err) {
        console.error("Google Places API error:", err.message);
        // Fall through to basic extraction
      }
    }

    // If we got at least a business name, consider it a success
    if (result.businessName) {
      return res.json({ success: true, data: result });
    }

    return res.status(404).json({
      error: "Could not extract business info. Try pasting the full URL from your browser (e.g. https://www.google.com/maps/place/...).",
    });
  } catch (err) {
    console.error("Error scraping Google Maps:", err.message);
    return res.status(500).json({
      error: "Failed to fetch Google Maps info",
      details: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// Admin middleware
// ---------------------------------------------------------------------------
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// ---------------------------------------------------------------------------
// Admin: Customer management
// ---------------------------------------------------------------------------
app.get("/api/customers", requireAuth, requireAdmin, async (_req, res) => {
  const customers = await getAllCustomers();
  return res.json({ customers });
});

app.post("/api/customers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, name, password, plan } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existing = await getCustomerByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "Customer with this email already exists" });
    }

    const id = crypto.randomUUID();
    let setupToken = null;

    if (password) {
      const passwordHash = bcrypt.hashSync(password, 10);
      await pool.query(
        `INSERT INTO customers (id, email, password_hash, name, plan, status) VALUES ($1, $2, $3, $4, $5, 'active')`,
        [id, email.toLowerCase(), passwordHash, name || "", plan || "standard"]
      );
    } else {
      // No password provided — generate setup token
      setupToken = crypto.randomBytes(32).toString("hex");
      const tempHash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10);
      await pool.query(
        `INSERT INTO customers (id, email, password_hash, name, plan, status, setup_token) VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
        [id, email.toLowerCase(), tempHash, name || "", plan || "standard", setupToken]
      );
    }

    const customer = await getCustomerById(id);
    if (setupToken) customer.setup_token = setupToken;
    return res.status(201).json({ customer });
  } catch (err) {
    console.error("Error creating customer:", err.message);
    return res.status(500).json({ error: "Failed to create customer", details: err.message });
  }
});

app.patch("/api/customers/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const { name, password, status, plan } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (password) { updates.push(`password_hash = $${idx++}`); values.push(bcrypt.hashSync(password, 10)); }
    if (status) { updates.push(`status = $${idx++}`); values.push(status); }
    if (plan) { updates.push(`plan = $${idx++}`); values.push(plan); }

    if (updates.length > 0) {
      values.push(req.params.id);
      await pool.query(`UPDATE customers SET ${updates.join(", ")} WHERE id = $${idx}`, values);
    }

    const updated = await getCustomerById(req.params.id);
    return res.json({ customer: updated });
  } catch (err) {
    console.error("Error updating customer:", err.message);
    return res.status(500).json({ error: "Failed to update customer", details: err.message });
  }
});

app.delete("/api/customers/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    await pool.query("DELETE FROM customers WHERE id = $1", [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting customer:", err.message);
    return res.status(500).json({ error: "Failed to delete customer", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// Customer: Their own agents
// ---------------------------------------------------------------------------
app.get("/api/my/agents", requireAuth, async (req, res) => {
  if (!req.user.customerId) {
    return res.status(403).json({ error: "Customer access required" });
  }
  const agents = await getAgentsByCustomerId(req.user.customerId);
  return res.json({ agents });
});

app.patch("/api/my/agents/:id", requireAuth, async (req, res) => {
  if (!req.user.customerId) {
    return res.status(403).json({ error: "Customer access required" });
  }
  try {
    const agent = await getAgent(req.params.id);
    if (!agent || agent.customerId !== req.user.customerId) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const { masterPrompt, businessName, ownerPhone } = req.body;
    const promptChanged = masterPrompt && masterPrompt !== agent.masterPrompt;
    const phoneChanged = ownerPhone && ownerPhone !== agent.ownerPhone;

    if (promptChanged || phoneChanged) {
      const newPrompt = masterPrompt || agent.masterPrompt;
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

    await saveAgent(agent);
    return res.json({ agent });
  } catch (err) {
    console.error("Error updating agent (customer):", err.message);
    return res.status(500).json({ error: "Failed to update agent", details: err.message });
  }
});

// Customer: Change password
app.post("/api/my/change-password", requireAuth, async (req, res) => {
  if (!req.user.customerId) {
    return res.status(403).json({ error: "Customer access required" });
  }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  try {
    const customer = await getCustomerById(req.user.customerId);
    if (!customer || !bcrypt.compareSync(currentPassword, customer.password_hash)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await pool.query("UPDATE customers SET password_hash = $1 WHERE id = $2", [hash, customer.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to change password" });
  }
});

// ---------------------------------------------------------------------------
// Global error handler — ensures CORS headers are always sent
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
