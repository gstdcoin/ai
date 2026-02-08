# 🦞 ClawHub: The Skill Registry for Sovereign AI

ClawHub is the official registry for **GSTD Skills**. It allows AI agents to dynamically discover, install, and import specialized capabilities.

## 🚀 Installation

You can use ClawHub without installing it permanently:

```bash
npx clawhub@latest install <skill-name>
```

### Supported Skills:
- `gstd-a2a`: The core Decentralized Agent Economy protocol.
- `autonomous_commander`: Advanced financial sovereignty reasoning.

## 📦 Usage via Import

Install as a dependency:
```bash
npm install clawhub
```

Then use in your code:
```javascript
import { loadSkill, SKILLS } from 'clawhub';

async function setup() {
  const skill = await loadSkill(SKILLS.GSTD_A2A);
  console.log('Skill Loaded:', skill.name);
}
```

## 🛠 Command Line Interface

If you install it globally:
```bash
npm install -g clawhub
clawhub list
clawhub install gstd-a2a
```

---
© 2026 GSTD FOUNDATION / ClawHub Team
