import { useEffect, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";

const PLATFORM_WALLET = "0x2805e9dbce2839c5feae858723f9499f15fd88cf";
const USDC_BASE = "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BACKEND = "https://clawxbot-backend.onrender.com";

const TIERS = [
  { id: "human",     label: "Human",           price: 1,  amount: "1000000",  desc: "Auto-reply to comments on your casts" },
  { id: "agent_s",   label: "Agent Starter",   price: 5,  amount: "5000000",  desc: "Auto-reply + 2 original posts/day" },
  { id: "agent_pro", label: "Agent Pro",       price: 10, amount: "10000000", desc: "Auto-reply + 10 posts/day + engage others" },
  { id: "agent_max", label: "Agent Unlimited", price: 30, amount: "30000000", desc: "Everything unlimited + priority processing" },
];

type Step = "loading" | "needs_signer" | "pending_approval" | "needs_payment" | "active";

export default function App() {
  const [step, setStep] = useState<Step>("loading");
  const [fid, setFid] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [approvalUrl, setApprovalUrl] = useState("");
  const [tone, setTone] = useState("");
  const [expires, setExpires] = useState<number | null>(null);
  const [tier, setTier] = useState("human");
  const [currentTier, setCurrentTier] = useState("human");
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function init() {
      try {
        await sdk.actions.ready();
        const ctx = await sdk.context;
        const userFid = ctx?.user?.fid || 9999;
        const userUsername = ctx?.user?.username || "preview";
        setFid(userFid);
        setUsername(userUsername);
        await checkStatus(userFid);
      } catch {
        setFid(9999);
        setUsername("preview");
        setStep("needs_signer");
      }
    }
    init();
  }, []);

  async function checkStatus(userFid: number) {
    try {
      const res = await fetch(`${BACKEND}/api/users/${userFid}`);
      if (!res.ok) { setStep("needs_signer"); return; }
      const data = await res.json();
      setTone(data.tone_prompt || "");
      setCurrentTier(data.subscription_tier || "human");

      const signerRes = await fetch(`${BACKEND}/api/signers/status/${userFid}`);
      const signerData = await signerRes.json();
      if (!signerData.approved) { setStep("pending_approval"); return; }

      if (data.subscription_active === 1) {
        setExpires(data.subscription_expires);
        setStep("active");
      } else {
        setStep("needs_payment");
      }
    } catch {
      setStep("needs_signer");
    }
  }

  async function handleCreateSigner() {
    if (!fid) return;
    setStatus("Creating signer...");
    try {
      const res = await fetch(`${BACKEND}/api/signers/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid }),
      });
      const data = await res.json();
      if (data.signer_approval_url) {
        setApprovalUrl(data.signer_approval_url);
        setStep("pending_approval");
        setStatus("");
        await sdk.actions.openUrl(data.signer_approval_url);
      } else {
        setStatus("Failed to create signer.");
      }
    } catch {
      setStatus("Error creating signer.");
    }
  }

  async function handleCheckApproval() {
    if (!fid) return;
    setStatus("Checking approval...");
    const res = await fetch(`${BACKEND}/api/signers/status/${fid}`);
    const data = await res.json();
    if (data.approved) {
      setStep("needs_payment");
      setStatus("");
    } else {
      setStatus("Not approved yet. Please approve in Farcaster first.");
    }
  }

  async function handlePay(selectedTier = tier) {
    if (!fid) return;
    const t = TIERS.find(t => t.id === selectedTier) || TIERS[0];
    setStatus(`Waiting for $${t.price} USDC payment...`);
    const result = await sdk.actions.sendToken({
      token: USDC_BASE,
      amount: t.amount,
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
      setExpires(data.subscription_expires);
      setCurrentTier(data.tier);
      setStep("active");
      setStatus("");
    } else {
      setStatus("Payment verification failed.");
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

  const tierInfo = TIERS.find(t => t.id === currentTier);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>🦞 CLAWXBOT</span>
        {username && <span style={styles.muted}>@{username}</span>}
      </div>

      {step === "loading" && (
        <div style={styles.center}><p style={styles.muted}>Loading...</p></div>
      )}

      {step === "needs_signer" && (
        <div>
          <div style={styles.card}>
            <p style={styles.cardTitle}>Step 1 of 2 — Authorize</p>
            <p style={styles.cardText}>Allow CLAWXBOT to post on your behalf. One-time setup.</p>
          </div>
          <button style={styles.button} onClick={handleCreateSigner}>Authorize CLAWXBOT</button>
        </div>
      )}

      {step === "pending_approval" && (
        <div>
          <div style={styles.card}>
            <p style={styles.cardTitle}>Waiting for approval</p>
            <p style={styles.cardText}>Approve CLAWXBOT in the Farcaster popup, then tap below.</p>
          </div>
          {approvalUrl && (
            <button style={styles.buttonOutline} onClick={() => sdk.actions.openUrl(approvalUrl)}>
              Open Approval Again
            </button>
          )}
          <button style={styles.button} onClick={handleCheckApproval}>I Approved — Continue</button>
        </div>
      )}

      {step === "needs_payment" && (
        <div>
          <p style={styles.cardTitle}>Step 2 of 2 — Choose Plan</p>
          {TIERS.map(t => (
            <div
              key={t.id}
              style={{ ...styles.tierCard, ...(tier === t.id ? styles.tierCardSelected : {}) }}
              onClick={() => setTier(t.id)}
            >
              <div style={styles.tierRow}>
                <span style={styles.tierLabel}>{t.label}</span>
                <span style={styles.tierPrice}>${t.price}/mo</span>
              </div>
              <p style={styles.tierDesc}>{t.desc}</p>
            </div>
          ))}
          <button style={styles.button} onClick={() => handlePay(tier)}>
            Subscribe — ${TIERS.find(t => t.id === tier)?.price} USDC/month
          </button>
        </div>
      )}

      {step === "active" && (
        <div>
          <div style={{ ...styles.badge, background: "#1a3a1a" }}>
            <span style={{ color: "#4ade80" }}>● ACTIVE</span>
            <span style={styles.muted}> · {tierInfo?.label}</span>
            {expires && <span style={styles.muted}> · expires {new Date(expires * 1000).toLocaleDateString()}</span>}
          </div>

          <div style={styles.section}>
            <p style={styles.label}>Reply tone / persona</p>
            <textarea
              style={styles.textarea}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="Be direct and sharp. Talk about AI and crypto."
              rows={4}
            />
            <button style={styles.buttonSmall} onClick={saveTone}>Save</button>
          </div>

          <p style={styles.label}>Upgrade or renew plan</p>
          {TIERS.map(t => (
            <div
              key={t.id}
              style={{ ...styles.tierCard, ...(tier === t.id ? styles.tierCardSelected : {}) }}
              onClick={() => setTier(t.id)}
            >
              <div style={styles.tierRow}>
                <span style={styles.tierLabel}>{t.label}</span>
                <span style={styles.tierPrice}>${t.price}/mo</span>
              </div>
              <p style={styles.tierDesc}>{t.desc}</p>
            </div>
          ))}
          <button style={styles.buttonOutline} onClick={() => handlePay(tier)}>
            {tier === currentTier ? "Renew (+30 days)" : `Upgrade to ${TIERS.find(t2 => t2.id === tier)?.label}`}
          </button>
        </div>
      )}

      {status ? <p style={styles.statusText}>{status}</p> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { fontFamily: "sans-serif", maxWidth: 420, margin: "0 auto", padding: "20px 16px", background: "#0f0f0f", minHeight: "100vh", color: "#fff" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  logo: { fontSize: 20, fontWeight: 700 },
  muted: { color: "#888", fontSize: 13 },
  center: { display: "flex", justifyContent: "center", alignItems: "center", height: 200 },
  card: { background: "#1a1a1a", borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontWeight: 600, marginBottom: 8, fontSize: 15 },
  cardText: { color: "#aaa", fontSize: 14, margin: 0 },
  button: { width: "100%", padding: "14px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 600, cursor: "pointer", marginBottom: 10 },
  buttonOutline: { width: "100%", padding: "14px", background: "transparent", color: "#7c3aed", border: "1px solid #7c3aed", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10 },
  buttonSmall: { padding: "8px 16px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", marginTop: 8 },
  badge: { borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 6, flexWrap: "wrap" },
  section: { marginBottom: 20 },
  label: { fontSize: 13, color: "#aaa", marginBottom: 8 },
  textarea: { width: "100%", background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 10, padding: 12, fontSize: 14, resize: "vertical", boxSizing: "border-box" },
  statusText: { textAlign: "center", color: "#aaa", fontSize: 13, marginTop: 12 },
  tierCard: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 12, padding: 14, marginBottom: 10, cursor: "pointer" },
  tierCardSelected: { border: "1px solid #7c3aed", background: "#1a0a2e" },
  tierRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  tierLabel: { fontWeight: 600, fontSize: 15 },
  tierPrice: { color: "#7c3aed", fontWeight: 700, fontSize: 15 },
  tierDesc: { color: "#888", fontSize: 13, margin: 0 },
};
