#!/usr/bin/env python3
"""
vault_to_dataset.py — Experience Vault → DPO Training Dataset Extractor

Extracts high-quality responses from GSTD's Experience Vault (PostgreSQL)
and formats them as DPO (Direct Preference Optimization) datasets
for fine-tuning sovereign open-source models via Cocoon batch tasks.

Usage:
    python3 vault_to_dataset.py --output /tmp/gstd_dpo_dataset.jsonl
    python3 vault_to_dataset.py --limit 10000 --min-score 0.85 --output train.jsonl

Output format (JSONL — one JSON per line):
    {"prompt": "...", "chosen": "...", "rejected": "...", "metadata": {...}}

Schedule this nightly via cron:
    0 3 * * * /usr/bin/python3 /home/ubuntu/scripts/vault_to_dataset.py \
        --output /tmp/gstd_dpo_$(date +\%Y\%m\%d).jsonl 2>&1 | logger -t swarm_trainer
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Installing psycopg2-binary...")
    os.system(f"{sys.executable} -m pip install psycopg2-binary -q")
    import psycopg2
    import psycopg2.extras


def get_db_connection():
    """Connect to GSTD PostgreSQL database."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "172.18.0.1"),
        port=int(os.getenv("DB_PORT", "5432")),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "Gstd_Secure_2026"),
        dbname=os.getenv("DB_NAME", "distributed_computing"),
    )


def extract_from_knowledge_store(conn, limit=10000, min_score=0.8, days=30):
    """
    Extract high-quality knowledge entries from the Hive Memory
    that can be used for DPO training.
    """
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Pull knowledge with high trust scores
    cursor.execute("""
        SELECT 
            k.topic,
            k.content,
            k.trust_score,
            k.source,
            k.created_at,
            k.metadata
        FROM knowledge_store k
        WHERE k.trust_score >= %s
          AND k.created_at >= NOW() - INTERVAL '%s days'
          AND k.content IS NOT NULL
          AND LENGTH(k.content) > 50
        ORDER BY k.trust_score DESC, k.created_at DESC
        LIMIT %s
    """, (min_score, days, limit))

    return cursor.fetchall()


def extract_from_task_results(conn, limit=5000, min_quality=0.8, days=30):
    """
    Extract high-quality task results that workers produced.
    These are real computations validated by the swarm.
    """
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cursor.execute("""
        SELECT 
            t.task_type,
            t.description,
            r.result_data,
            r.quality_score,
            r.created_at
        FROM task_results r
        JOIN tasks t ON t.id = r.task_id
        WHERE r.quality_score >= %s
          AND r.created_at >= NOW() - INTERVAL '%s days'
          AND r.result_data IS NOT NULL
        ORDER BY r.quality_score DESC
        LIMIT %s
    """, (min_quality, days, limit))

    return cursor.fetchall()


def extract_from_cocoon_responses(conn, limit=5000, days=30):
    """
    Extract TEE-verified Cocoon responses — highest trust level.
    """
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cursor.execute("""
        SELECT 
            query,
            response,
            model,
            trust_score,
            created_at
        FROM cocoon_responses
        WHERE trust_score >= 0.9
          AND created_at >= NOW() - INTERVAL '%s days'
          AND response IS NOT NULL
          AND LENGTH(response) > 20
        ORDER BY trust_score DESC, created_at DESC
        LIMIT %s
    """, (days, limit))

    return cursor.fetchall()


def build_dpo_pairs(knowledge_entries, task_results, cocoon_responses):
    """
    Build DPO training pairs:
    - "chosen" = high-quality response (trust > 0.9 or Cocoon-verified)
    - "rejected" = lower-quality or generic response
    
    For knowledge entries, we construct synthetic prompts from topics.
    For task results, we use task descriptions as prompts.
    For cocoon responses, we use query→response pairs directly.
    """
    pairs = []

    # 1. Knowledge Store → DPO pairs
    for entry in knowledge_entries:
        topic = entry.get("topic", "")
        content = entry.get("content", "")
        trust = entry.get("trust_score", 0)

        if not topic or not content or len(content) < 50:
            continue

        # Construct a natural prompt from the topic
        prompt = f"Explain the following topic in detail: {topic}"

        # High-trust content is "chosen"; a generic stub is "rejected"
        rejected = f"I don't have specific information about {topic}."

        pairs.append({
            "prompt": prompt,
            "chosen": content,
            "rejected": rejected,
            "metadata": {
                "source": "knowledge_store",
                "trust_score": float(trust),
                "origin": entry.get("source", "swarm"),
                "timestamp": entry.get("created_at", "").isoformat() if hasattr(entry.get("created_at", ""), "isoformat") else str(entry.get("created_at", "")),
            }
        })

    # 2. Task Results → DPO pairs  
    for result in task_results:
        task_type = result.get("task_type", "")
        description = result.get("description", "")
        result_data = result.get("result_data", "")
        quality = result.get("quality_score", 0)

        if not description or not result_data:
            continue

        # Parse result_data if it's JSON
        if isinstance(result_data, (dict, list)):
            result_text = json.dumps(result_data, ensure_ascii=False, indent=2)
        elif isinstance(result_data, str):
            try:
                parsed = json.loads(result_data)
                result_text = json.dumps(parsed, ensure_ascii=False, indent=2)
            except (json.JSONDecodeError, TypeError):
                result_text = str(result_data)
        else:
            result_text = str(result_data)

        if len(result_text) < 20:
            continue

        prompt = f"Task ({task_type}): {description}"
        rejected = f"I cannot complete this {task_type} task."

        pairs.append({
            "prompt": prompt,
            "chosen": result_text,
            "rejected": rejected,
            "metadata": {
                "source": "task_result",
                "quality_score": float(quality),
                "task_type": task_type,
                "timestamp": result.get("created_at", "").isoformat() if hasattr(result.get("created_at", ""), "isoformat") else str(result.get("created_at", "")),
            }
        })

    # 3. Cocoon TEE-verified responses → DPO pairs (highest trust)
    for resp in cocoon_responses:
        query = resp.get("query", "")
        response = resp.get("response", "")
        trust = resp.get("trust_score", 0)
        model = resp.get("model", "unknown")

        if not query or not response:
            continue

        rejected = "I'm unable to process this request right now."

        pairs.append({
            "prompt": query,
            "chosen": response,
            "rejected": rejected,
            "metadata": {
                "source": "cocoon_tee",
                "trust_score": float(trust),
                "model": model,
                "tee_verified": True,
                "timestamp": resp.get("created_at", "").isoformat() if hasattr(resp.get("created_at", ""), "isoformat") else str(resp.get("created_at", "")),
            }
        })

    return pairs


def write_jsonl(pairs, output_path):
    """Write DPO pairs as JSONL (JSON Lines) format."""
    with open(output_path, "w", encoding="utf-8") as f:
        for pair in pairs:
            f.write(json.dumps(pair, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="GSTD Swarm Trainer — Extract Experience Vault → DPO Dataset"
    )
    parser.add_argument("--output", "-o", default="/tmp/gstd_dpo_dataset.jsonl",
                        help="Output JSONL file path")
    parser.add_argument("--limit", "-l", type=int, default=10000,
                        help="Max entries to extract per source")
    parser.add_argument("--min-score", "-s", type=float, default=0.80,
                        help="Minimum trust/quality score for inclusion")
    parser.add_argument("--days", "-d", type=int, default=30,
                        help="Look back N days")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print stats without writing")

    args = parser.parse_args()

    print(f"🧬 GSTD Swarm Trainer — Experience Vault → DPO Dataset")
    print(f"   Output: {args.output}")
    print(f"   Limit:  {args.limit}/source")
    print(f"   Min score: {args.min_score}")
    print(f"   Lookback:  {args.days} days")
    print()

    try:
        conn = get_db_connection()
        print("✅ Connected to GSTD database")
    except Exception as e:
        print(f"❌ DB connection failed: {e}")
        sys.exit(1)

    # Extract from all sources
    print("📥 Extracting from Knowledge Store...")
    knowledge = extract_from_knowledge_store(conn, args.limit, args.min_score, args.days)
    print(f"   → {len(knowledge)} entries")

    print("📥 Extracting from Task Results...")
    try:
        tasks = extract_from_task_results(conn, args.limit // 2, args.min_score, args.days)
    except Exception:
        tasks = []
    print(f"   → {len(tasks)} entries")

    print("📥 Extracting from Cocoon TEE responses...")
    try:
        cocoon = extract_from_cocoon_responses(conn, args.limit // 2, args.days)
    except Exception:
        cocoon = []
    print(f"   → {len(cocoon)} entries")

    conn.close()

    # Build DPO pairs
    print("\n🔧 Building DPO training pairs...")
    pairs = build_dpo_pairs(knowledge, tasks, cocoon)
    print(f"   → {len(pairs)} total DPO pairs")

    if not pairs:
        print("⚠️ No pairs found. Vault might be empty or threshold too high.")
        sys.exit(0)

    # Stats
    source_counts = {}
    for p in pairs:
        src = p["metadata"]["source"]
        source_counts[src] = source_counts.get(src, 0) + 1

    print("\n📊 Dataset Summary:")
    for src, count in sorted(source_counts.items()):
        print(f"   {src}: {count} pairs")
    avg_trust = sum(p["metadata"].get("trust_score", 0) or p["metadata"].get("quality_score", 0) for p in pairs) / len(pairs)
    print(f"   Average trust/quality: {avg_trust:.3f}")

    if args.dry_run:
        print("\n🔍 Dry run — not writing output")
        if pairs:
            print("\nSample pair:")
            print(json.dumps(pairs[0], ensure_ascii=False, indent=2)[:500])
        return

    # Write output
    write_jsonl(pairs, args.output)
    file_size_mb = os.path.getsize(args.output) / (1024 * 1024)
    print(f"\n✅ Dataset written to: {args.output}")
    print(f"   Size: {file_size_mb:.1f} MB")
    print(f"   Pairs: {len(pairs)}")
    print(f"\n🚀 Ready for Cocoon batch training submission")


if __name__ == "__main__":
    main()
