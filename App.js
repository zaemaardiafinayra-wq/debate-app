import React, { useState, useRef, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Picker,
  Platform,
} from "react-native";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ---- Config ----
// Set this to your deployed backend URL (Vercel function that proxies to Anthropic).
const BACKEND_URL =
  Constants.expoConfig?.extra?.backendUrl ||
  "https://YOUR-BACKEND.vercel.app/api/debate";

// ---- Personas ----
const PRESET_PERSONAS = [
  { id: "pragmatist", name: "Pragmatist", tag: "cost & feasibility", color: "#5B7C99" },
  { id: "visionary", name: "Visionary", tag: "long-term upside", color: "#C97B5A" },
  { id: "risk-officer", name: "Risk Officer", tag: "worst-case thinking", color: "#8B6F47" },
  { id: "operator", name: "Operator", tag: "speed & execution", color: "#5A8B6F" },
  { id: "contrarian", name: "Contrarian", tag: "challenges assumptions", color: "#9C5B6E" },
  { id: "minimalist", name: "Minimalist", tag: "simplify, cut scope", color: "#6E6E5A" },
  { id: "analyst", name: "Analyst", tag: "evidence & numbers", color: "#4A7A8C" },
  { id: "advocate", name: "Advocate", tag: "human impact first", color: "#A66B8E" },
  { id: "mother", name: "Mother", tag: "worried, protective, family-first", color: "#B97A8C" },
  { id: "father", name: "Father", tag: "stern, duty & responsibility", color: "#7A8B6E" },
  { id: "influencer", name: "Influencer", tag: "hustle culture, growth mindset", color: "#D9A45A" },
  { id: "best-friend", name: "Best Friend", tag: "blunt, casual, has your back", color: "#6EA6B9" },
  { id: "boss", name: "Boss", tag: "results-driven, no excuses", color: "#9C7A4A" },
  { id: "therapist", name: "Therapist", tag: "calm, asks about feelings", color: "#8E9C7A" },
  { id: "grandparent", name: "Grandparent", tag: "old-school wisdom, frugal", color: "#A88F6E" },
  { id: "finfluencer", name: "Finfluencer", tag: "passive income, side hustles", color: "#C9A876" },
];

const SLOT_COLORS = ["#C97B5A", "#5B7C99", "#5A8B6F", "#9C5B6E", "#C9A876"];

function pickRandomPersona(exclude) {
  const pool = PRESET_PERSONAS.filter((p) => !exclude.includes(p.id));
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Device ID (anonymous, stored locally) ----
async function getDeviceId() {
  try {
    let id = await AsyncStorage.getItem("debate_device_id");
    if (!id) {
      id =
        "dev_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 10);
      await AsyncStorage.setItem("debate_device_id", id);
    }
    return id;
  } catch (e) {
    // Fallback - not persisted, but still works for this session
    return "dev_session_" + Math.random().toString(36).slice(2, 10);
  }
}

// ---- Backend call ----
// The app NEVER holds the Anthropic API key. It calls your own backend,
// which holds the key and forwards the request to Anthropic.
// Throws an error with `.limitReached = true` if the daily free limit is hit.
async function callDebateBackend(systemPrompt, userPrompt, deviceId, isSubscribed) {
  const response = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: systemPrompt,
      prompt: userPrompt,
      deviceId,
      isSubscribed,
    }),
  });

  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    const err = new Error(data.message || "Daily free limit reached.");
    err.limitReached = true;
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  const data = await response.json();
  return { text: (data.text || "").trim(), remaining: data.remaining };
}

export default function App() {
  const [problem, setProblem] = useState("");
  const [slots, setSlots] = useState([
    { presetId: PRESET_PERSONAS[0].id },
    { presetId: PRESET_PERSONAS[1].id },
  ]);
  const [rounds, setRounds] = useState(3);
  const [messages, setMessages] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [userInput, setUserInput] = useState("");
  const scrollRef = useRef(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false); // Stage 2 will wire this to Play Billing
  const [remaining, setRemaining] = useState(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }
  }, [messages, running]);

  const getPersona = (slot, idx) => {
    const p =
      PRESET_PERSONAS.find((p) => p.id === slot.presetId) ||
      PRESET_PERSONAS[idx % PRESET_PERSONAS.length];
    return { ...p, color: SLOT_COLORS[idx % SLOT_COLORS.length] };
  };

  const personas = slots.map((s, i) => getPersona(s, i));

  const handleRandomAll = () => {
    const used = [];
    setSlots(
      slots.map((s) => {
        const p = pickRandomPersona(used);
        used.push(p.id);
        return { presetId: p.id };
      })
    );
  };

  const addSlot = () => {
    if (slots.length >= 5) return;
    const used = slots.map((s) => s.presetId);
    const p = pickRandomPersona(used);
    setSlots([...slots, { presetId: p ? p.id : PRESET_PERSONAS[0].id }]);
  };

  const removeSlot = (idx) => {
    if (slots.length <= 2) return;
    setSlots(slots.filter((_, i) => i !== idx));
  };

  const buildSystem = (self, others) =>
    `You are "${self.name}" (${self.tag}), debating with ${others.map((o) => `"${o.name}"`).join(", ")} to find the best solution to a real problem.

RULES:
- Read the last message carefully. React DIRECTLY to it — agree, challenge, or build on the specific point made.
- If the last speaker said something you disagree with, push back on that exact point.
- If you agree but want to add, say so and extend the idea.
- Mention the other persona by name if addressing them directly.
- ONE sentence, max 15 words. No greetings, no fluff, no repeating the problem.
- Stay fully in character as "${self.name}" (${self.tag}).`;

  const speakOnce = async (self, others, history, extraInstruction) => {
    const sys = buildSystem(self, others);
    const histText = history.map((h) => `${h.name}: ${h.text}`).join("\n");
    const lastMsg = history.length > 0 ? history[history.length - 1] : null;
    const lastLine = lastMsg ? `\nLast message to react to → ${lastMsg.name}: "${lastMsg.text}"` : "";
    const userPrompt = `Problem: ${problem.trim()}\n\nDebate so far:\n${histText || "(none yet)"}${lastLine}\n\n${extraInstruction || `${self.name}, your direct response (1 sentence):`}`;
    const { text, remaining: rem } = await callDebateBackend(
      sys,
      userPrompt,
      deviceId,
      isSubscribed
    );
    if (typeof rem === "number") setRemaining(rem);
    return text;
  };

  const runDebate = async () => {
    if (!problem.trim()) {
      setError("Type a problem first.");
      return;
    }
    setError("");
    setRunning(true);
    setMessages([]);

    try {
      let history = [];
      for (let r = 1; r <= rounds; r++) {
        const order = shuffle(personas.map((p, i) => i));
        for (const idx of order) {
          const self = personas[idx];
          const others = personas.filter((_, i) => i !== idx);
          const text = await speakOnce(self, others, history);
          const entry = { name: self.name, color: self.color, text };
          history.push(entry);
          setMessages((prev) => [...prev, entry]);
        }
      }
    } catch (e) {
      if (e.limitReached) {
        setShowPaywall(true);
      } else {
        setError("Something went wrong. Check your backend URL / connection.");
      }
    } finally {
      setRunning(false);
    }
  };

  const sendUserMessage = async () => {
    if (!userInput.trim() || running) return;
    const text = userInput.trim();
    setUserInput("");
    setError("");
    setRunning(true);

    const userEntry = { name: "You", color: "#F0EDE5", text, isUser: true };
    let history = [...messages, userEntry];
    setMessages((prev) => [...prev, userEntry]);

    try {
      const order = shuffle(personas.map((p, i) => i));
      for (const idx of order) {
        const self = personas[idx];
        const others = personas.filter((_, i) => i !== idx);
        const reply = await speakOnce(
          self,
          others,
          history,
          "The user just spoke directly. Your 1 short sentence response (you may address them):"
        );
        const entry = { name: self.name, color: self.color, text: reply };
        history.push(entry);
        setMessages((prev) => [...prev, entry]);
      }
    } catch (e) {
      if (e.limitReached) {
        setShowPaywall(true);
      } else {
        setError("Something went wrong. Check your backend URL / connection.");
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header / controls */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>DEBATE CHAT</Text>
          {!isSubscribed && remaining !== null && (
            <Text style={styles.remainingText}>
              {remaining > 0 ? `${remaining} free left today` : "0 left"}
            </Text>
          )}
        </View>

        <TextInput
          style={[styles.input, styles.problemInput]}
          value={problem}
          onChangeText={setProblem}
          placeholder="Describe your problem..."
          placeholderTextColor="#5A554A"
          multiline
          editable={!running && messages.length === 0}
        />

        <View style={styles.personaRow}>
          {slots.map((slot, idx) => {
            const persona = getPersona(slot, idx);
            return (
              <View
                key={idx}
                style={[
                  styles.personaSlot,
                  { borderColor: persona.color + "55" },
                ]}
              >
                <Text style={[styles.personaName, { color: persona.color }]}>
                  {persona.name}
                </Text>
                <Text style={styles.personaTag}>{persona.tag}</Text>
                {slots.length > 2 && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeSlot(idx)}
                    disabled={running}
                  >
                    <Text style={styles.removeBtnText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          {slots.length < 5 && (
            <TouchableOpacity
              style={styles.addSlot}
              onPress={addSlot}
              disabled={running}
            >
              <Text style={styles.addSlotText}>+ add</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={styles.randomBtn}
            onPress={handleRandomAll}
            disabled={running}
          >
            <Text style={styles.randomBtnText}>🔀 Random all</Text>
          </TouchableOpacity>

          <View style={styles.roundsWrap}>
            <Text style={styles.roundsLabel}>Rounds</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.roundBtn,
                    rounds === n && styles.roundBtnActive,
                  ]}
                  onPress={() => setRounds(n)}
                  disabled={running}
                >
                  <Text
                    style={[
                      styles.roundBtnText,
                      rounds === n && styles.roundBtnTextActive,
                    ]}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.startBtn,
            (running || messages.length > 0) && styles.startBtnDisabled,
          ]}
          onPress={runDebate}
          disabled={running || messages.length > 0}
        >
          {running ? (
            <ActivityIndicator color="#9A958A" size="small" />
          ) : (
            <Text style={styles.startBtnText}>▶ Start</Text>
          )}
        </TouchableOpacity>

        {!!error && <Text style={styles.error}>⚠ {error}</Text>}
      </View>

      {/* Chat */}
      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
      >
        {messages.length === 0 && !running && (
          <Text style={styles.placeholder}>
            Set up 2-5 personas, describe your problem, hit Start. Jump in
            anytime.
          </Text>
        )}
        {messages.map((m, i) => {
          const isLeft =
            !m.isUser && personas.findIndex((p) => p.name === m.name) % 2 === 0;
          return (
            <View
              key={i}
              style={[
                styles.bubbleWrap,
                {
                  alignSelf: m.isUser
                    ? "flex-end"
                    : isLeft
                    ? "flex-start"
                    : "flex-end",
                },
              ]}
            >
              <Text
                style={[
                  styles.bubbleName,
                  { color: m.color, textAlign: m.isUser || !isLeft ? "right" : "left" },
                ]}
              >
                {m.isUser ? "👤 You" : m.name}
              </Text>
              <View
                style={[
                  styles.bubble,
                  m.isUser
                    ? styles.bubbleUser
                    : { borderColor: m.color + "44" },
                ]}
              >
                <Text style={styles.bubbleText}>{m.text}</Text>
              </View>
            </View>
          );
        })}
        {running && (
          <View style={styles.thinkingRow}>
            <ActivityIndicator color="#9A958A" size="small" />
            <Text style={styles.thinkingText}>Thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Join input */}
      {messages.length > 0 && (
        <View style={styles.joinRow}>
          <TextInput
            style={[styles.input, styles.joinInput]}
            value={userInput}
            onChangeText={setUserInput}
            placeholder="Jump into the debate..."
            placeholderTextColor="#5A554A"
            editable={!running}
            onSubmitEditing={sendUserMessage}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (running || !userInput.trim()) && styles.sendBtnDisabled,
            ]}
            onPress={sendUserMessage}
            disabled={running || !userInput.trim()}
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Paywall */}
      {showPaywall && (
        <View style={styles.paywallOverlay}>
          <View style={styles.paywallCard}>
            <Text style={styles.paywallTitle}>Daily limit reached</Text>
            <Text style={styles.paywallBody}>
              You've used today's free debate messages. Subscribe for
              unlimited debates, up to 5 personas, and custom personas.
            </Text>
            <TouchableOpacity
              style={styles.subscribeBtn}
              onPress={() => {
                // Stage 2: wire this to Google Play Billing purchase flow.
                // For now this is a placeholder.
              }}
            >
              <Text style={styles.subscribeBtnText}>
                Subscribe — RM 9.90/month
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.paywallClose}
              onPress={() => setShowPaywall(false)}
            >
              <Text style={styles.paywallCloseText}>
                Maybe later — come back tomorrow
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#13110F" },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2E2A24",
  },
  title: {
    color: "#C97B5A",
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: "700",
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  remainingText: {
    color: "#9A958A",
    fontSize: 11,
    fontStyle: "italic",
  },
  paywallOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(19,17,15,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  paywallCard: {
    backgroundColor: "#1C1A17",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3A3530",
    padding: 20,
    width: "100%",
    maxWidth: 340,
  },
  paywallTitle: {
    color: "#F0EDE5",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  paywallBody: {
    color: "#9A958A",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  subscribeBtn: {
    backgroundColor: "#C97B5A",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  subscribeBtnText: { color: "#13110F", fontWeight: "700", fontSize: 14 },
  paywallClose: { alignItems: "center", paddingVertical: 6 },
  paywallCloseText: {
    color: "#7A756A",
    fontSize: 12,
    textDecorationLine: "underline",
  },
  input: {
    backgroundColor: "#1C1A17",
    borderWidth: 1,
    borderColor: "#2E2A24",
    borderRadius: 6,
    color: "#F0EDE5",
    padding: 10,
    fontSize: 14,
  },
  problemInput: {
    minHeight: 50,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  personaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  personaSlot: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    minWidth: 110,
    backgroundColor: "#1C1A17",
    position: "relative",
  },
  personaName: { fontWeight: "700", fontSize: 12 },
  personaTag: { color: "#9A958A", fontSize: 10, marginTop: 2 },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#2A2620",
    borderWidth: 1,
    borderColor: "#3A3530",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: { color: "#9A958A", fontSize: 11, lineHeight: 12 },
  addSlot: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#3A3530",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  addSlotText: { color: "#7A756A", fontSize: 12 },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  randomBtn: {
    borderWidth: 1,
    borderColor: "#3A3530",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  randomBtnText: { color: "#C9A876", fontSize: 12 },
  roundsWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  roundsLabel: { color: "#8A8578", fontSize: 11 },
  roundBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#2E2A24",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  roundBtnActive: { borderColor: "#C97B5A", backgroundColor: "#C97B5A22" },
  roundBtnText: { color: "#9A958A", fontSize: 11 },
  roundBtnTextActive: { color: "#C97B5A" },
  startBtn: {
    backgroundColor: "#C97B5A",
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
  },
  startBtnDisabled: { backgroundColor: "#2A2620" },
  startBtnText: { color: "#13110F", fontWeight: "700", fontSize: 14 },
  error: { color: "#D98A7A", fontSize: 12, marginTop: 8 },
  chat: { flex: 1 },
  chatContent: { padding: 16, gap: 10 },
  placeholder: {
    color: "#5A554A",
    fontSize: 13,
    textAlign: "center",
    marginTop: 40,
  },
  bubbleWrap: { maxWidth: "85%", marginBottom: 10 },
  bubbleName: { fontSize: 11, fontWeight: "700", marginBottom: 3 },
  bubble: {
    backgroundColor: "#1C1A17",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  bubbleUser: { backgroundColor: "#C97B5A22", borderColor: "#C97B5A66" },
  bubbleText: { color: "#E5E1D8", fontSize: 13.5, lineHeight: 19 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  thinkingText: { color: "#9A958A", fontSize: 12 },
  joinRow: {
    flexDirection: "row",
    padding: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2E2A24",
    gap: 8,
  },
  joinInput: { flex: 1 },
  sendBtn: {
    backgroundColor: "#C97B5A",
    borderRadius: 6,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#2A2620" },
  sendBtnText: { color: "#13110F", fontSize: 16 },
});
