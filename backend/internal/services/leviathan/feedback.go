package leviathan

import (
	"fmt"
)

// FormatFeedbackReport produces the Architect report for Final Resolution protocol.
// Self-Correcting Prophet: includes Reasoning when prediction was wrong (Feedback Honesty).
func FormatFeedbackReport(results []AuditResult) string {
	if len(results) == 0 {
		return ""
	}
	totalVirtual := 0.0
	correctCount := 0
	for _, r := range results {
		totalVirtual += r.VirtualPctEarned
		if r.Correct {
			correctCount++
		}
	}
	r := results[0]
	status := "❌ WRONG"
	if r.Correct {
		status = "✅ CORRECT"
	}
	msg := fmt.Sprintf(
		"📋 FINAL RESOLUTION — Outcome Report\n\n"+
			"Market: %s\n"+
			"Question: %s\n\n"+
			"Prediction: Leviathan %.1f%% | Market at bet: %.1f%%\n"+
			"Resolved: %s\n"+
			"Result: %s\n\n"+
			"Virtual %% (vs market at bet): %+.1f%%\n"+
			"Track Record: %d/%d correct\n\n",
		r.EventName,
		r.MarketQuestion,
		r.LeviathanPct*100,
		r.MarketPctAtBet*100,
		resolveStr(r.ResolvedYes),
		status,
		totalVirtual,
		correctCount,
		len(results),
	)
	if !r.Correct && r.Reasoning != "" {
		msg += fmt.Sprintf("Reasoning: %s\n\n", r.Reasoning)
	}
	msg += "Status: Logged in Shadow Engine. Vectors pruned."
	return msg
}

func resolveStr(yes bool) string {
	if yes {
		return "Yes"
	}
	return "No"
}
