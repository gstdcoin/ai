# GSTD Marketplace - Frontend Specification
## "Zero-Friction" Landing Page Design

**Goal**: Convert visitors to Workers or Clients in < 30 seconds.
**Vibe**: Enterprise, Clean, Trustworthy (Like AWS but simpler).
**Tech**: Next.js + TailwindCSS + Framer Motion (already in stack).

### 1. Hero Section ("The Hook")
- **Headline**: "Global Compute Grid. Zero Overhead."
- **Sub-headline**: "Run Docker containers on a decentralized network of 500+ nodes. 50% cheaper than AWS."
- **Visual**: 3D Spinning Globe (Three.js/Mapbox) showing active nodes (Almaty, London, NY) with light pulses connecting them.
- **CTAs (Side-by-Side)**:
  - `[ Hire Compute ]` (Primary, Gradient Gold) -> Scrolls to 'Quick Launch'
  - `[ Become Worker ]` (Secondary, Outline) -> Scrolls to 'Worker Guide'
- **Live Ticker (Top Bar)**: `🟢 Network Status: Operational | ⚡ 15.2 TFLOPS Available | 🌍 12 Countries`

### 2. "Hire Compute" - Quick Launch Widget
*Concept: e-Commerce for Compute*

**Title**: "Deploy in Seconds"
**UI**: A simple 3-step card (no login required to see price):

1.  **Select Power**:
    *   [ Standard (2 vCPU / 4GB) ] - $0.04/hr
    *   [ Pro (4 vCPU / 8GB) ] - $0.08/hr
    *   [ GPU A100 (Coming Soon) ]
2.  **Select Region**:
    *   [ Global (Cheapest) ]
    *   [ Europe ]
    *   [ Asia ]
3.  **Action**:
    *   Button: `[ Buy Credits (GSTD) ]` -> Opens TonConnect Modal.
    *   *Micro-copy*: "Pay with TON. No credit card required."

### 3. "Become Worker" - 3-Step Guide
**Title**: "Monetize Your Idle Hardware"

*   **Step 1: Download**: "Run our Docker one-liner."
    *   `curl -sL get.gstd.io | bash` (Copy Button)
*   **Step 2: Connect**: "Link your wallet in the dashboard."
*   **Step 3: Earn**: "Get paid in GSTD/TON every 24 hours."

**Visual**: A live earnings calculator slider. "If you run 24/7 with [i5 CPU] -> You earn [~1.2 GSTD/day]".

### 4. Technical Advantages (The "Why")
*Grid Layout of 4 icons:*
1.  **Censorship Resistant**: distributed across 12 countries.
2.  **Verifiable**: Proof-of-Work checks on every task.
3.  **Green**: Utilizes idle consumer hardware (recycling compute).
4.  **Instant**: No KYC, no account approvals. Start now.

### 5. Social Proof / Footer
- **Live Stats**: (Pulled from `/api/v1/stats/public`)
  - "Tasks Completed: 1,420"
  - "Total Paid to Workers: 4500 GSTD"
- **Partners/Tech**: Docker, TON, Linux, Nginx logos (Gray scale).
- **Links**: Telegram Support, Docs, GitHub.

---

## Technical Implementation Notes

### Mobile Optimization
- **Hamburgers are forbidden** for main actions. Use a bottom sticky bar on mobile: `[ Hire ]` | `[ Earn ]`.
- **Map replacement**: On mobile, replace 3D Globe with a static customized SVG map to save battery/performance.
- **Touch targets**: All buttons > 44px height.

### Localization (i18n)
- **Default**: English.
- **Auto-detect**: Russian (for CIS market), Chinese.
- **Storage**: `public/locales/{en,ru,cn}.json`.
- **Switcher**: Globe icon in Navbar.

### Zero-Friction Terms
- ~~Docker Container~~ -> **Compute Unit**
- ~~Crypto Wallet~~ -> **Login**
- ~~Gas Fee~~ -> **Network Fee**
- ~~Smart Contract~~ -> **Protocol**
