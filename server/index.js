import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { VapiClient } from "@vapi-ai/server-sdk";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const vapi = new VapiClient({ token: process.env.VAPI_API_KEY });

// TODO: Replace with database
const agents = new Map();

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
app.post("/api/agents", async (req, res) => {
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
app.get("/api/agents", (_req, res) => {
  const list = Array.from(agents.values());
  return res.json({ agents: list });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id - Get a single agent
// ---------------------------------------------------------------------------
app.get("/api/agents/:id", (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: "Agent not found" });
  }
  return res.json({ agent });
});

// ---------------------------------------------------------------------------
// PATCH /api/agents/:id - Update agent
// ---------------------------------------------------------------------------
app.patch("/api/agents/:id", async (req, res) => {
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
app.delete("/api/agents/:id", async (req, res) => {
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

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting agent:", err);
    return res
      .status(500)
      .json({ error: "Failed to delete agent", details: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
