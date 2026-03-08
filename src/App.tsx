import { useEffect, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";

const PLATFORM_WALLET = "0x2805e9dbce2839c5feae858723f9499f15fd88cf";
const USDC_BASE = "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BACKEND = "https://your-backend.com";

type Screen = "home" | "settings" | "loading";

export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [fid, setFid] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [active, setActive] = useState(false);
  const [expires, setExpires] = useState<number | null>(null);
  const [tone, setTone] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function init() {
      try {
        await sdk.actions.ready();
        const ctx = await sdk.context;
        if (ctx?.user?.fid) {
          setFid(ctx.user.fid);
          setUsername(ctx.user.username || "");
          fetchStatus(ctx.user.fid);
        } else {
          // No Farcaster context — browser preview mode
          setFid(9999);
          setUsername("preview");
          setScreen("home");
        }
      } catch {
        setFid(9999);
        setUsername("preview");
        setScreen("home");
      }
    }
    init();
  }, []);

  async function fetchStatus(userFid: number) {
    try {
      const res = await fetch(`${BACKEND}/api/users/${userFid}`);
      if (res.ok) {
        const data = await res.json();
        setActive(data.subscription_active === 1);
        setExpires(data.subscription_expires);
        setTone(data.tone_prompt || "");
      }
    } catch {}
    setScreen("home");
  }

  async function handlePay() {
    if (!fid) return;
    setStatus("Waiting for payment...");
    const result = await sdk.actions.sendToken({
      token: USDC_BASE,
      amount: "1000000",
      recipientAddress: PLATFORM_WALLET,
    });

    if (!result.success) {
      setStatus(result.reason === "rejected_by_user" ? "Cancelled." : "Payment failed.");
      return;
    }

    setStatus("Verifying payment...");
    const res = await fetch(`${BACKEND}/api/payments/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fid, tx_hash: result.send.transaction }),
    });

    if (res.ok) {
      const data = await res.json();
      setActive(true);
      setExpires(data.subscription_expires);
      setStatus("Active! CLAWXBOT is replying for you.");
    } else {
      setStatus("Verification failed. Contact support.");
    }
  }

  async function saveTone() {
    if (!fid || !tone.trim()) return;
    await fetch(`${BACKEND}/api/users/${fid}/tone`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tone_prompt: tone }),
    });
    setStatus("Tone saved.");
  }

  if (screen === "loading") {
    return (
      <div style={styles.center}>
        <p style={styles.muted}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>🦞 CLAWXBOT</span>
        {username && <span style={styles.muted}>@{username}</span>}
      </div>

      <div style={{ ...styles.badge, background: active ? "#1a3a1a" : "#2a1a1a" }}>
        <span style={{ color: active ? "#4ade80" : "#f87171" }}>
          {active ? "● ACTIVE" : "● INACTIVE"}
        </span>
        {expires && active && (
          <span style={styles.muted}>
            {" "}· expires {new Date(expires * 1000).toLocaleDateString()}
          </span>
        )}
      </div>

      {!active && (
        <button style={styles.button} onClick={handlePay}>
          Activate — $1 USDC / month
        </button>
      )}

      {active && (
        <div style={styles.section}>
          <p style={styles.label}>Reply tone / persona</p>
          <textarea
            style={styles.textarea}
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="Be direct and sharp. Talk about AI and crypto. Never shill."
            rows={4}
          />
          <button style={styles.buttonSmall} onClick={saveTone}>
            Save
          </button>
        </div>
      )}

      {active && (
        <button style={styles.buttonOutline} onClick={handlePay}>
          Renew (+30 days)
        </button>
      )}

      {status ? <p style={styles.statusText}>{status}</p> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: "sans-serif",
    maxWidth: 420,
    margin: "0 auto",
    padding: "24px 16px",
    color: "#f1f1f1",
    background: "#0f0f0f",
    minHeight: "100vh",
  },
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "#0f0f0f",
    color: "#f1f1f1",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  logo: { fontSize: 20, fontWeight: 700 },
  muted: { fontSize: 13, color: "#888" },
  badge: {
    padding: "10px 14px",
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 13,
  },
  button: {
    width: "100%",
    padding: "14px",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: 16,
  },
  buttonOutline: {
    width: "100%",
    padding: "12px",
    background: "transparent",
    color: "#7c3aed",
    border: "1px solid #7c3aed",
    borderRadius: 10,
    fontSize: 14,
    cursor: "pointer",
    marginBottom: 16,
  },
  buttonSmall: {
    padding: "8px 16px",
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
    marginTop: 8,
  },
  section: { marginBottom: 20 },
  label: { fontSize: 13, color: "#aaa", marginBottom: 6 },
  textarea: {
    width: "100%",
    background: "#1a1a1a",
    color: "#f1f1f1",
    border: "1px solid #333",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    resize: "vertical",
    boxSizing: "border-box",
  },
  statusText: { fontSize: 13, color: "#aaa", marginTop: 12, textAlign: "center" },
};
