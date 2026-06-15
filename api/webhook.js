const axios = require("axios");
const { Redis } = require("@upstash/redis");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const KIMCHI_API_KEY = process.env.KIMCHI_API_KEY;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {

  if (req.method !== "POST") {
    return res.status(200).send("Bot is running");
  }

  try {

    const update = req.body;

    if (!update || !update.message) {
      return res.status(200).send("No message");
    }

    const chatId = update.message.chat.id;
    const userText = update.message.text;

if (userText === "/start") {

  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text: `👋 Welcome to ArtificialLodu!

Commands:
/research <topic>
/clear

Just send a message to start chatting.`
    }
  );

  return res.status(200).send("OK");
}
    
console.log("SENDER USERNAME:", update.message?.from?.username);
console.log("SENDER ID:", update.message?.from?.id);

    // Clear memory
    if (userText === "/clear") {

      await redis.del(`chat:${chatId}`);

      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          chat_id: chatId,
          text: "Memory cleared."
        }
      );

      return res.status(200).send("OK");
    }

    // Research mode
    if (userText.startsWith("/research ")) {

      const topic = userText.replace("/research ", "");

      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          chat_id: chatId,
          text: "Researching..."
        }
      );

      const aiResponse = await axios.post(
        "https://llm.kimchi.dev/openai/v1/chat/completions",
        {
          model: "kimi-k2.6",
          messages: [
            {
              role: "system",
              content: "You are an expert researcher."
            },
            {
              role: "user",
              content: `
Create a detailed report about:

${topic}

Include:
1. Overview
2. Key Facts
3. Advantages
4. Disadvantages
5. Conclusion
`
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${KIMCHI_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      let reply =
        aiResponse?.data?.choices?.[0]?.message?.content ||
        "No response.";

      reply = reply
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();

      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          chat_id: chatId,
          text: reply
        }
      );

      return res.status(200).send("OK");
    }

    // Load memory
    let messages = await redis.get(`chat:${chatId}`);

    if (!messages) {
      messages = [];
    }

    messages.push({
      role: "user",
      content: userText
    });

    messages = messages.slice(-20);

    const aiResponse = await axios.post(
      "https://llm.kimchi.dev/openai/v1/chat/completions",
      {
        model: "kimi-k2.6",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful Telegram AI assistant."
          },
          ...messages
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${KIMCHI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    let reply =
      aiResponse?.data?.choices?.[0]?.message?.content ||
      "No response.";

    reply = reply
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();

    messages.push({
      role: "assistant",
      content: reply
    });

    messages = messages.slice(-20);

    await redis.set(`chat:${chatId}`, messages);

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: reply
      }
    );

    return res.status(200).send("OK");

  } catch (error) {

    console.error(
      error?.response?.data ||
      error?.message ||
      error
    );

    return res.status(200).send("ERROR");
  }
};
