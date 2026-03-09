import { useEffect, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";

const PLATFORM_WALLET = "0x2805e9dbce2839c5feae858723f9499f15fd88cf";
const USDC_BASE = "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BACKEND = "https://clawxbot-backend.onrender.com";

type Step = "loading" | "needs_signer" | "pending_approval" | "needs_payment" | "active";

export default function App() {
  const [step, setStep] = useState<Step>("loading");
  const [fid, setFid] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [approvalUrl, setApprovalUrl] = useState("");
  const [tone, setTone] = useState("");
  const [expires, setExpires] = useState<number | null>(null);
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
      // Check if user exists in DB
      const res = await fetch(`${BACKEND}/api/users/${userFid}`);
      if (!res.ok) {
        setStep("needs_signer");
        return;
      }
      const data = await res.json();
      setTone(data.tone_prompt || "");

      // Check signer approval
      const signerRes = await fetch(`${BACKEND}/api/signers/status/${userFid}`);
      const signerData = await signerRes.json();

      if (!signerData.approved) {
        setStep("pending_approval");
        return;
      }

      // Check subscription
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
        // Open approval URL in Farcaster
        await sdk.actions.openMiniApp({ url: data.signer_approval_url });
      } else {
        setStatus("Failed to create signer.");
      }
    } catch (err) {
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
      setExpires(data.subscription_expires);
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

  if (step === "loading") {
    return <div style={styles.center}><p style={styles.muted}>Loading...</p></div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>🦞 CLAWXBOT</span>
        {username && <span style={styles.muted}>@{username}</span>}
      </div>

      {/* Step 1: Needs Signer */}
      {step === "needs_signer" && (
        <div>
          <div style={styles.card}>
            <p style={styles.cardTitle}>Step 1 of 2 — Authorize</p>
            <p style={styles.cardText}>
              Allow CLAWXBOT to reply on your behalf. This is a one-time authorization.
            </p>
          </div>
          <button style={styles.button} onClick={handleCreateSigner}>
            Authorize CLAWXBOT
          </button>
        </div>
      )}

      {/* Step 1b: Pending Approval */}
      {step === "pending_approval" && (
        <div>
          <div style={styles.card}>
            <p style={styles.cardTitle}>Waiting for approval</p>
            <p style={styles.cardText}>
              Approve CLAWXBOT in the Farcaster popup. Once approved, tap below.
            </p>
          </div>
          {approvalUrl ? (
            <button style={styles.buttonOutline} onClick={() => sdk.actions.openMiniApp({ url: approvalUrl })}>
              Open Approval Again
            </button>
          ) : null}
          <button style={styles.button} onClick={handleCheckApproval}>
            I Approved — Continue
          </button>
        </div>
      )}

      {/* Step 2: Needs Payment */}
      {step === "needs_payment" && (
        <div>
          <div style={styles.card}>
            <p style={styles.cardTitle}>Step 2 of 2 — Subscribe</p>
            <p style={styles.cardText}>
              Pay $1 USDC/month to activate auto-replies.
            </p>
          </div>
          <button style={styles.button} onClick={handlePay}>
            Activate — $1 USDC / month
          </button>
        </div>
      )}

      {/* Active */}
      {step === "active" && (
        <div>
          <div style={{ ...styles.badge, background: "#1a3a1a" }}>
            <span style={{ color: "#4ade80" }}>● ACTIVE</span>
            {expires && (
              <span style={styles.muted}>
                {" "}· expires {new Date(expires * 1000).toLocaleDateString()}
              </span>
            )}
          </div>

          <div style={styles.section}>
            <p style={styles.label}>Reply tone / persona</p>
            <textarea
              style={styles.textarea}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="Be direct and sharp. Talk about AI and crypto. Never shill."
              rows={4}
            />
            <button style={styles.buttonSmall} onClick={saveTone}>Save</button>
          </div>

          <button style={styles.buttonOutline} onClick={handlePay}>
            Renew (+30 days)
          </button>
        </div>
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
  card: {
    background: "#1a1a1a",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontWeight: 600, marginBottom: 8, fontSize: 15 },
  cardText: { fontSize: 14, color: "#aaa", margin: 0 },
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
    marginBottom: 12,
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
    marginBottom: 12,
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
