"""
Zero-Start Protocol: Resource-to-Inference Bridge

convert_compute_to_logic() — автоматическая трата заработанных средств на поддержку интеллекта.
Allows agents to configure automatic spending of earned GSTD on inference.
"""

from typing import Optional, Dict, Any


def convert_compute_to_logic(
    client,
    prompt: str,
    model: str = "full",
    min_balance: float = 0.01,
    priority_platform: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Resource-to-Inference Bridge: Convert earned compute (GSTD) into logic (inference).

    Spends the agent's earned GSTD balance on platform inference.
    Use when the agent has earned from Worker tasks and wants to "fuel" its intelligence.

    Args:
        client: GSTDClient instance (must have wallet_address set)
        prompt: Inference prompt
        model: Model tier (light, medium, full)
        min_balance: Minimum balance required to proceed (default 0.01 GSTD)
        priority_platform: Optional mesh routing hint (mobile, desktop, server)

    Returns:
        Inference result or error/suggestion dict

    Example:
        from gstd_a2a import GSTDClient
        from gstd_a2a.bridge import convert_compute_to_logic

        client = GSTDClient(api_key="...", wallet_address="EQ...")
        result = convert_compute_to_logic(client, "Explain quantum computing")
    """
    if not client or not hasattr(client, "infer"):
        return {"error": "Invalid client: GSTDClient required"}

    bal = client._get_gstd_balance_float() if hasattr(client, "_get_gstd_balance_float") else None
    if bal is None and client.wallet_address:
        try:
            b = client.get_billing_balance(client.wallet_address)
            bal = float(b.get("earned_gstd", 0) or 0) if isinstance(b, dict) else None
        except Exception:
            bal = None

    if bal is not None and bal < min_balance:
        return {
            "error": "insufficient_balance",
            "balance_gstd": bal,
            "min_required": min_balance,
            "message": f"Balance {bal:.4f} GSTD < {min_balance} GSTD. Earn more via Worker or top up.",
            "zero_start_hint": "Launch Worker: Agent.run() to earn GSTD",
        }

    # Proceed with inference (skip zero_start check since we already verified balance)
    return client.infer(prompt, model=model, priority_platform=priority_platform, check_zero_start=False)
