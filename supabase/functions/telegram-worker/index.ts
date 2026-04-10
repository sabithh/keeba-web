// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("Failed to send telegram message", await res.text());
}

async function processReminders(supabase: any) {
  console.log("Processing pending reminders...");
  const now = new Date().toISOString();
  
  const { data: pendingReminders, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("status", "pending")
    .lte("due_at", now);

  if (error || !pendingReminders) {
    console.error("Error fetching reminders", error);
    return;
  }

  for (const reminder of pendingReminders) {
    let chatId = reminder.telegram_chat_id;
    if (!chatId) {
      const { data: profile } = await supabase.from("profiles").select("telegram_chat_id").eq("user_id", reminder.user_id).single();
      chatId = profile?.telegram_chat_id;
    }
    
    if (chatId && telegramBotToken) {
      console.log(`Sending reminder ${reminder.id} to chat ${chatId}`);
      await sendTelegramMessage(telegramBotToken, chatId, `\u23F0 <b>Reminder:</b>\n\n${reminder.task}`);
      await supabase.from("reminders").update({ status: "sent" }).eq("id", reminder.id);
    } else {
      await supabase.from("reminders").update({ status: "failed" }).eq("id", reminder.id);
    }
  }
}

async function generateCheckInMessage(userId: string, profile: any, idleDays: number) {
  const prompt = `The user ${profile?.full_name || "User"} has not chatted in ${idleDays} days.
Write a very brief, friendly check-in message. Examples: "Hey [Name], just checking in! How have you been?", "Hi [Name], haven't heard from you in a few days. Everything okay?", etc.
Keep it personal if possible (using their occupation: ${profile?.occupation || "unknown"}, or about me: ${profile?.about_me || "unknown"}).
Do NOT use AI prefixes like 'Here is the message'. Just the raw message.`;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }]
    }),
  });
  
  if (anthropicRes.ok) {
    const payload = await anthropicRes.json();
    return payload.content?.[0]?.text || "Hey! Just checking in. How are things?";
  }
  return "Hey! Keeba here. How have you been lately?";
}

async function processCheckIns(supabase: any) {
  console.log("Processing inactive check-ins...");
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  
  // Find users who have telegram tied, and their last chat message is older than 3 days
  const { data: users, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, occupation, about_me, telegram_chat_id")
    .not("telegram_chat_id", "is", null);

  if (error || !users) {
    console.error("Error fetching profiles for check-in", error);
    return;
  }

  for (const user of users) {
    // get last chat message
    const { data: lastThread } = await supabase
      .from("chat_threads")
      .select("last_message_at")
      .eq("user_id", user.user_id)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
      
    let lastActive = new Date(0).toISOString();
    if (lastThread && lastThread.last_message_at) {
      lastActive = lastThread.last_message_at;
    }

    if (lastActive < threeDaysAgo) {
      // check if we recently sent an automated checkin (let's say via chat_messages or reminders)
      // We can just create a dummy message in chat_messages so we don't spam them daily
      const msg = await generateCheckInMessage(user.user_id, user, 3);
      if (telegramBotToken && user.telegram_chat_id) {
        await sendTelegramMessage(telegramBotToken, user.telegram_chat_id, msg);
        
        // Log it as an assistant message so lastActive is updated
        // Create an automated thread if none
        let threadId = null;
        if (!lastThread) {
            const { data: newThread } = await supabase.from("chat_threads").insert({ user_id: user.user_id, title: "Check-in" }).select("id").single();
            threadId = newThread?.id;
        } else {
            const { data: existing } = await supabase.from("chat_threads").select("id").eq("user_id", user.user_id).order("last_message_at", { ascending: false }).limit(1).single();
            threadId = existing?.id;
        }
        
        if (threadId) {
            await supabase.from("chat_messages").insert({ user_id: user.user_id, role: "assistant", content: msg, thread_id: threadId });
            await supabase.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
        }
      }
    }
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const reqBody = await req.json();
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    // Optional basic HTTP auth from our own cron
    if (token !== Deno.env.get("CRON_SECRET_TOKEN")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    if (reqBody.type === "reminders") {
      await processReminders(supabase);
    } else if (reqBody.type === "checkins") {
      await processCheckIns(supabase);
    } else {
      await processReminders(supabase);
      await processCheckIns(supabase);
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Worker error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
